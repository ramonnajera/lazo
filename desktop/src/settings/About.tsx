import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

export default function About() {
  const [version, setVersion] = useState("");
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);
  return (
    <div className="max-w-md space-y-3 text-sm">
      <h1 className="text-lg font-semibold">Acerca de</h1>
      <p>Lazo para escritorio {version && `v${version}`}</p>
      <p className="text-neutral-500">
        Partes adaptadas de coucou (https://github.com/Louis-CFM/coucou), licencia MIT, © Louis Raillé. Ver THIRD_PARTY.md.
      </p>
    </div>
  );
}
