//! Token de la API en el Administrador de credenciales de Windows.
//! El token nunca se devuelve a JS: solo se guarda y se consulta si existe.

use keyring::Entry;

const SERVICE: &str = "LazoDesktop";
const USER: &str = "api-token";

fn entry() -> keyring::Result<Entry> {
    Entry::new(SERVICE, USER)
}

pub fn get_token() -> Option<String> {
    entry().ok()?.get_password().ok().filter(|t| !t.is_empty())
}

pub fn set_token(t: &str) -> Result<(), String> {
    entry().and_then(|e| e.set_password(t)).map_err(|e| e.to_string())
}
