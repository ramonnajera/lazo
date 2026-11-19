fn main() {
    // El recurso de Windows (ícono del .exe) se incrusta aquí: si cambian los íconos,
    // cargo debe volver a correr este script o el ejecutable conserva el ícono viejo.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
