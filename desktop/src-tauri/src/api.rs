//! Proxy hacia lazo-api: el token se añade aquí y nunca llega a la interfaz.

use crate::secrets;
use lazo_core::config::Config;
use serde::Serialize;
use serde_json::Value;
use std::{sync::Mutex, time::Duration};
use tauri::State;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApiErrorKind {
    Offline,
    Unauthorized,
    Http,
    NoToken,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ApiError {
    pub kind: ApiErrorKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    pub message: String,
}

impl ApiError {
    fn new(kind: ApiErrorKind, status: Option<u16>, message: impl Into<String>) -> Self {
        Self { kind, status, message: message.into() }
    }
}

/// `base` sin `/` final + `path` con `/` inicial.
pub fn join_url(base: &str, path: &str) -> String {
    let path = if path.starts_with('/') { path.to_string() } else { format!("/{path}") };
    format!("{}{}", base.trim_end_matches('/'), path)
}

/// Convierte un status no 200 y el cuerpo en `ApiError`.
pub fn error_for_status(status: u16, body: &str) -> ApiError {
    if status == 401 {
        return ApiError::new(ApiErrorKind::Unauthorized, Some(status), "Token inválido o ausente");
    }
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v.get("error").and_then(|e| e.as_str()).map(str::to_string))
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| format!("Error HTTP {status}"));
    ApiError::new(ApiErrorKind::Http, Some(status), message)
}

fn client() -> Result<reqwest::Client, ApiError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(240))
        .build()
        .map_err(|e| ApiError::new(ApiErrorKind::Offline, None, e.to_string()))
}

fn transport_error(e: reqwest::Error) -> ApiError {
    ApiError::new(ApiErrorKind::Offline, None, e.without_url().to_string())
}

async fn finish(res: reqwest::Response) -> Result<Value, ApiError> {
    let status = res.status().as_u16();
    let text = res.text().await.map_err(transport_error)?;
    // 200 y también 201: el servidor responde 201 al crear algo (por ejemplo, al vincular un dispositivo)
    if (200..300).contains(&status) {
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        return serde_json::from_str(&text)
            .map_err(|e| ApiError::new(ApiErrorKind::Http, Some(status), format!("Respuesta no válida: {e}")));
    }
    Err(error_for_status(status, &text))
}

fn base_url(cfg: &State<'_, Mutex<Config>>) -> String {
    cfg.lock().unwrap_or_else(|e| e.into_inner()).connection.api_url.clone()
}

fn token() -> Result<String, ApiError> {
    secrets::get_token().ok_or_else(|| ApiError::new(ApiErrorKind::NoToken, None, "Falta el token de Lazo"))
}

/// El token que devuelve `POST /perfil/vincular/unirse`.
pub fn token_from_body(v: &Value) -> Result<String, ApiError> {
    v.get("token")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|t| !t.is_empty())
        .ok_or_else(|| ApiError::new(ApiErrorKind::Http, None, "El servidor no devolvió un token"))
}

/// Vincula esta computadora con la persona usando el código de 6 dígitos de otro dispositivo; el token queda en
/// Credenciales de Windows y nunca pasa por la interfaz.
#[tauri::command]
pub async fn link_device(cfg: State<'_, Mutex<Config>>, code: String, name: String) -> Result<(), ApiError> {
    let url = join_url(&base_url(&cfg), "/perfil/vincular/unirse");
    let body = serde_json::json!({ "codigo": code.trim(), "nombre": name.trim() });
    let res = client()?.post(url).json(&body).send().await.map_err(transport_error)?;
    let token = token_from_body(&finish(res).await?)?;
    secrets::set_token(&token).map_err(|e| ApiError::new(ApiErrorKind::Http, None, e))
}

/// Guarda el token en Credenciales de Windows (nunca se devuelve a JS).
#[tauri::command]
pub fn set_token(token: String) -> Result<(), String> {
    secrets::set_token(token.trim())
}

#[tauri::command]
pub fn has_token() -> bool {
    secrets::get_token().is_some()
}

/// Petición JSON a lazo-api (también la usa el hilo de voz, sin pasar por JS).
pub async fn request_json(base: &str, method: &str, path: &str, body: Option<Value>) -> Result<Value, ApiError> {
    let token = token()?;
    let url = join_url(base, path);
    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| ApiError::new(ApiErrorKind::Http, None, "Método no válido"))?;
    let mut req = client()?.request(method, url).bearer_auth(token);
    if let Some(b) = body.filter(|b| !b.is_null()) {
        req = req.json(&b);
    }
    finish(req.send().await.map_err(transport_error)?).await
}

#[tauri::command]
pub async fn api_request(
    cfg: State<'_, Mutex<Config>>,
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, ApiError> {
    request_json(&base_url(&cfg), &method, &path, body).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_url_normalizes_slashes() {
        assert_eq!(join_url("https://h/lazo-reloj", "/today"), "https://h/lazo-reloj/today");
        assert_eq!(join_url("https://h/lazo-reloj/", "today"), "https://h/lazo-reloj/today");
        assert_eq!(join_url("https://h/x", "/cuentas?all=1"), "https://h/x/cuentas?all=1");
    }

    #[test]
    fn token_from_body_requires_a_non_empty_token() {
        assert_eq!(token_from_body(&serde_json::json!({ "token": "lzo_abc", "perfil": {} })).unwrap(), "lzo_abc");
        assert_eq!(token_from_body(&serde_json::json!({ "token": "" })).unwrap_err().kind, ApiErrorKind::Http);
        assert_eq!(token_from_body(&serde_json::json!({ "perfil": {} })).unwrap_err().kind, ApiErrorKind::Http);
        assert_eq!(token_from_body(&serde_json::json!({ "token": 5 })).unwrap_err().kind, ApiErrorKind::Http);
    }

    #[test]
    fn maps_401_to_unauthorized() {
        let e = error_for_status(401, r#"{"error":"nope"}"#);
        assert_eq!(e.kind, ApiErrorKind::Unauthorized);
        assert_eq!(e.status, Some(401));
    }

    #[test]
    fn maps_other_status_to_http_with_body_error() {
        let e = error_for_status(400, r#"{"error":"summary requerido"}"#);
        assert_eq!(e.kind, ApiErrorKind::Http);
        assert_eq!(e.message, "summary requerido");
        let e = error_for_status(502, "<html>");
        assert_eq!(e.message, "Error HTTP 502");
    }

    #[test]
    fn error_serializes_as_contract() {
        let v = serde_json::to_value(ApiError::new(ApiErrorKind::NoToken, None, "x")).unwrap();
        assert_eq!(v, serde_json::json!({"kind":"no_token","message":"x"}));
        let v = serde_json::to_value(ApiError::new(ApiErrorKind::Http, Some(404), "y")).unwrap();
        assert_eq!(v, serde_json::json!({"kind":"http","status":404,"message":"y"}));
    }
}
