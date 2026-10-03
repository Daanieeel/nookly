import type { ViewModule } from "#/lib/api/views.ts";
import type { View } from "#/lib/store/nav.ts";

/// The page a saved View of `module` opens on, or the plain page when `viewId` is
/// left out: a cross-Space page for an overview module, otherwise that module's page
/// in `spaceId`.
export function viewTarget(module: ViewModule, spaceId: string, viewId?: string): View {
  switch (module) {
    case "tasks-overview":
      return { kind: "tasks", viewId };
    case "assignments-overview":
      return { kind: "assignments", viewId };
    default:
      return { kind: "module", spaceId, module, viewId };
  }
}
