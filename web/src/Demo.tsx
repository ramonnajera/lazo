import { useCallback, useState } from "react";
import Bar from "@isla/island/Bar";
import Sections from "@isla/island/Sections";
import type { Section } from "@isla/island/model";
import { getTomas, sendMessage } from "@isla/api/client";
import { usePanelData, refreshKeys } from "@isla/panels/usePanelData";
import { addMessage, beginTyped, resetChat } from "@isla/panels/chatStore";
import { chatErrorText } from "@isla/panels/Chat";
import { hablar } from "@isla/voice/habla";
import { reiniciar } from "./motor";

const PANELES = ["tomas", "citas", "mediciones", "convocatorias"];
const FRASES = ["¿Qué me toca ahora?", "Ya me tomé el omega 3", "Anota mi glucosa: 110", "¿Cuándo es mi próxima cita?", "Me siento ansioso, ¿qué hago?", "¿Cuántas risperidonas me quedan?"];

/** La isla de Lazo para Windows, abierta y viva dentro de la página: los mismos paneles, con los datos de Mateo. */
export default function Demo() {
  const [section, setSection] = useState<Section>("hoy");
  const tomas = usePanelData("tomas", getTomas);
  const [enviando, setEnviando] = useState(false);

  const decir = useCallback(async (frase: string) => {
    setSection("chat");
    addMessage("user", frase);
    setEnviando(true);
    const fin = beginTyped();
    try {
      const r = await sendMessage(frase);
      const reply = r?.reply?.trim() || "Lazo no respondió nada";
      addMessage("lazo", reply);
      hablar(reply);
      refreshKeys(...PANELES);
    } catch (e) {
      addMessage("error", chatErrorText(e));
    } finally {
      fin();
      setEnviando(false);
    }
  }, []);

  const empezarDeNuevo = () => {
    reiniciar();
    resetChat();
    setSection("hoy");
    refreshKeys(...PANELES);
  };

  return (
    <div className="demo">
      <div className="demo-marco">
        <div className="isl demo-isl" data-view="open">
          <Bar tomas={tomas.data?.tomas} active={section} onSection={setSection} />
          <Sections section={section} hidden={false} onTalk={() => setSection("chat")} />
        </div>
      </div>
      <div className="demo-frases" aria-label="Frases para probar">
        <span className="demo-frases-t">Pruébale a decir:</span>
        {FRASES.map((f) => (
          <button key={f} type="button" className="chip" disabled={enviando} onClick={() => void decir(f)}>
            {f}
          </button>
        ))}
      </div>
      <p className="demo-nota">
        Estás usando a <b>Mateo Ruiz</b>, un joven autista con datos ficticios. Lo que cambies se guarda solo en este navegador.{" "}
        <button type="button" className="enlace" onClick={empezarDeNuevo}>
          Empezar de nuevo
        </button>
      </p>
    </div>
  );
}
