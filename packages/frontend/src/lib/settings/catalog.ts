import { isSyncedSetting } from "@nookly/shared/sync";
import { z } from "zod";
import { SETTING_IDS, type SettingJson, definitionOf } from "./registry.ts";

/// One setting as the CLI knows it: what it is, its default, and the JSON Schema a value
/// must match. Checks the schema cannot say (a shortcut that clashes with another) are
/// left to the app, which turns a value it rejects into the default.
export interface CatalogEntry {
  id: string;
  category: string;
  title: string;
  description: string;
  default: SettingJson;
  /// Follows the account to the person's other devices.
  synced: boolean;
  schema: SettingJson;
}

/// Every setting, in the registry's order: the catalog checked in at
/// `apps/desktop/src-tauri/src/cli/settings-catalog.json`, which `nookly cli settings`
/// reads. A test keeps the two the same.
export function settingsCatalog(): CatalogEntry[] {
  return SETTING_IDS.map((id) => {
    const def = definitionOf(id);
    const { $schema: _, ...schema } = z.toJSONSchema(def.schema, {
      unrepresentable: "any",
      io: "input",
    });
    return {
      id,
      category: def.category,
      title: def.title,
      description: def.description,
      default: def.default,
      synced: isSyncedSetting(id),
      // SAFETY: a JSON Schema is plain JSON.
      schema: schema as SettingJson,
    };
  });
}
