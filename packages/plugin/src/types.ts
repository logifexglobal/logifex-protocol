export interface PluginManifest {
  readonly name: string;
  readonly version: string;
  readonly type: "plugin";
  readonly description: string;
  readonly license: string;
  readonly logifex: { readonly core: string };
  readonly permissions: readonly string[];
  readonly provides: readonly string[];
  readonly extensionPoints: readonly string[];
  readonly entry: string;
  readonly category?: string;
  readonly author?: string;
  readonly repository?: string;
  readonly usesAI?: boolean;
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly valid: true; readonly manifest: PluginManifest }
  | { readonly valid: false; readonly errors: readonly ValidationError[] };
