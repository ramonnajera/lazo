// Formatos de fecha y hora de Lazo. Todo en español; las horas con am/pm (más fáciles de leer que 24 h).

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const parse = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/** Fecha local de hoy como YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** «20:05» → «8:05 pm». */
export function hora12(hhmm: string | null | undefined): string {
  const m = hhmm ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "am" : "pm"}`;
}

/** «Hoy», «Mañana» o «vie 20 nov». */
export function relDate(iso: string, today: string): string {
  const d = parse(iso);
  const t = parse(today);
  if (!d || !t) return iso;
  const diff = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}

/** «miércoles 18 de noviembre». */
export function fechaLarga(iso: string): string {
  const d = parse(iso);
  return d ? `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}` : iso;
}
