// Espejo de lazo_core::config::Config (serde camelCase).
export type Theme = "light" | "dark" | "system";

export interface General { autostart: boolean; openOnHover: boolean; monitor: string | null; theme: Theme; sounds: boolean }
export interface Keys { dictation: string; lazo: string; openIsland: string; chat: string }
export interface Replacement { from: string; to: string }
export interface DictationCfg { handsFreeDoubleTap: boolean; restoreClipboard: boolean; dictionary: string[]; replacements: Replacement[] }
export interface VoiceCfg { microphone: string | null; language: string }
export interface Alias { name: string; target: string }
export interface SearchEngine { name: string; urlTemplate: string }
export interface CommandsCfg { sites: Alias[]; programs: Alias[]; folders: Alias[]; searchEngines: SearchEngine[]; systemEnabled: boolean; confirmPower: boolean }
export interface AlertsCfg { eventLeadMin: number; todosTime: string; dndFrom: string | null; dndTo: string | null; dndFullscreen: boolean }
export interface MusicCfg { show: boolean; preferredApp: string | null }
export interface ConnectionCfg { apiUrl: string; refreshSec: number }

export interface Config {
  general: General;
  keys: Keys;
  dictation: DictationCfg;
  voice: VoiceCfg;
  commands: CommandsCfg;
  alerts: AlertsCfg;
  music: MusicCfg;
  connection: ConnectionCfg;
}
