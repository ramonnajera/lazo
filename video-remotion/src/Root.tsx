import "./tema";
import { Composition } from "remotion";
import { LazoVideo, TOTAL } from "./Video";
import { ALTO, ANCHO, FPS } from "./tema";

export const RemotionRoot: React.FC = () => (
  <Composition id="Lazo" component={LazoVideo} durationInFrames={TOTAL} fps={FPS} width={ANCHO} height={ALTO} />
);
