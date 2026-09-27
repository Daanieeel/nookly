import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCloud, IconDeviceDesktop, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import {
  type AmbientSettings,
  type ProviderKind,
  aiAddProvider,
  aiAutoTitleLog,
  aiAvailability,
  aiDefaultProviderId,
  aiGetAmbient,
  aiGetProfile,
  aiListModels,
  aiListProviders,
  aiReadProfileFile,
  aiRemoveProvider,
  aiRunAutoTitleNow,
  aiSetAmbient,
  aiSetDefaultProvider,
  aiSetProfile,
  aiSetProviderModel,
  aiUndoAutoTitle,
} from "#/lib/api/assistant.ts";
import { Badge } from "@nookly/ui/components/badge";
import { Button } from "@nookly/ui/components/button";
import { Checkbox } from "@nookly/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@nookly/ui/components/dialog";
import { Input } from "@nookly/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nookly/ui/components/select";
import { Separator } from "@nookly/ui/components/separator";
import { Switch } from "@nookly/ui/components/switch";
import { Textarea } from "@nookly/ui/components/textarea";

const PROVIDER_KINDS: { value: ProviderKind; label: string; cloud: boolean }[] = [
  { value: "anthropic", label: "Anthropic", cloud: true },
  { value: "open-ai", label: "OpenAI", cloud: true },
  { value: "gemini", label: "Google Gemini", cloud: true },
  { value: "open-ai-compatible", label: "OpenAI-compatible endpoint", cloud: true },
];

function AddProviderForm() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ProviderKind>("anthropic");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const isCompatible = kind === "open-ai-compatible";

  const add = useMutation({
    mutationFn: () =>
      aiAddProvider({
        kind,
        label: label || PROVIDER_KINDS.find((k) => k.value === kind)?.label || kind,
        baseUrl: isCompatible ? baseUrl : undefined,
        apiKey: apiKey || undefined,
        cloudNoticeAcknowledged: acknowledged,
      }),
    onSuccess: () => {
      setLabel("");
      setBaseUrl("");
      setApiKey("");
      setAcknowledged(false);
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      queryClient.invalidateQueries({ queryKey: ["ai-availability"] });
    },
  });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-input p-3">
      <div className="flex gap-2">
        <Select
          value={kind}
          onValueChange={(v) => {
            // SAFETY: `v` is always one of `PROVIDER_KINDS`' own `value`s, since
            // every `SelectItem` below is rendered from that same list.
            setKind(v as ProviderKind);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Label (optional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      {isCompatible && (
        <Input
          placeholder="Base URL, e.g. http://localhost:11434/v1"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      )}
      <Input
        type="password"
        placeholder={isCompatible ? "API key (optional for local servers)" : "API key"}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <label htmlFor="ai-cloud-notice" className="flex items-start gap-2 text-xs text-muted-foreground">
        <Checkbox
          id="ai-cloud-notice"
          checked={acknowledged}
          onCheckedChange={(v) => setAcknowledged(v === true)}
        />
        Prompt content, and any data the assistant's tools fetch, is sent to this provider when it's
        active. Nookly never proxies or bundles access; I pay this provider directly.
      </label>
      <Button
        size="sm"
        variant="secondary"
        className="self-end"
        disabled={add.isPending || (!acknowledged && !isCompatible) || (isCompatible && !baseUrl)}
        onClick={() => add.mutate()}
      >
        Add provider
      </Button>
    </div>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({ queryKey: ["ai-profile"], queryFn: aiGetProfile });
  const [draft, setDraft] = useState(profile ?? "");
  const [loaded, setLoaded] = useState(false);
  if (profile !== undefined && !loaded && profile) {
    setDraft(profile);
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: (block: string) => aiSetProfile(block),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-profile"] }),
  });

  async function importFile() {
    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "Markdown", extensions: ["md", "txt"] }],
    });
    if (!path) return;
    const content = await aiReadProfileFile(path);
    setDraft(content);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">About me</span>
        <Button variant="ghost" size="sm" onClick={importFile}>
          Import from file
        </Button>
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Program, what you already know, how you learn, where you struggle..."
        className="min-h-24"
      />
      <Button
        size="sm"
        variant="secondary"
        className="self-end"
        disabled={save.isPending}
        onClick={() => save.mutate(draft)}
      >
        Save
      </Button>
    </div>
  );
}

function AmbientSection() {
  const queryClient = useQueryClient();
  const { data: ambient } = useQuery({ queryKey: ["ai-ambient"], queryFn: aiGetAmbient });
  const set = useMutation({
    mutationFn: (next: AmbientSettings) => aiSetAmbient(next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-ambient"] }),
  });
  if (!ambient) return null;

  const row = (key: keyof AmbientSettings, label: string) => (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch
        checked={Boolean(ambient[key])}
        onCheckedChange={(checked) => set.mutate({ ...ambient, [key]: checked })}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Ambient features (on-device/local providers only)
      </span>
      {row("autoTitleJots", "Auto-title untitled jots")}
      {row("suggestLabelsRelationships", "Suggest labels and relationships while writing")}
      {row("summarizeFilesOnUpload", "Summarize files on upload")}
      {ambient.autoTitleJots && <AutoTitleLog />}
    </div>
  );
}

/// Recent auto-titles with one-click undo (PLAN §11), plus a manual "Run now"
/// instead of waiting for the next background sweep.
function AutoTitleLog() {
  const queryClient = useQueryClient();
  const { data: log = [] } = useQuery({ queryKey: ["ai-auto-title-log"], queryFn: aiAutoTitleLog });
  const runNow = useMutation({
    mutationFn: aiRunAutoTitleNow,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-auto-title-log"] }),
  });
  const undo = useMutation({
    mutationFn: (entityId: string) => aiUndoAutoTitle(entityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-auto-title-log"] }),
  });

  return (
    <div className="flex flex-col gap-1 rounded-md border border-input p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Recent auto-titles</span>
        <Button variant="ghost" size="sm" disabled={runNow.isPending} onClick={() => runNow.mutate()}>
          Run now
        </Button>
      </div>
      {log.length === 0 && <p className="text-xs text-muted-foreground">None yet.</p>}
      {log.map((entry) => (
        <div key={entry.entityId} className="flex items-center justify-between text-sm">
          <span className="truncate">
            {entry.entityKey}: "{entry.newTitle}"
          </span>
          <Button variant="ghost" size="sm" onClick={() => undo.mutate(entry.entityId)}>
            Undo
          </Button>
        </div>
      ))}
    </div>
  );
}

/// Model ids are never hardcoded (PLAN §3.2) — fetches the provider's own
/// current list and lets the user pick, since without a model set here every
/// conversation with this provider silently fails (an empty model name makes
/// a malformed request the provider just rejects).
function ModelPicker({ providerId, currentModel }: { providerId: string; currentModel?: string | null }) {
  const queryClient = useQueryClient();
  const { data: models, isLoading, isError } = useQuery({
    queryKey: ["ai-models", providerId],
    queryFn: () => aiListModels(providerId),
  });
  const setModel = useMutation({
    mutationFn: (model: string) => aiSetProviderModel(providerId, model),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-providers"] }),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading models...</p>;
  if (isError || !models || models.length === 0) {
    return <p className="text-xs text-destructive">Couldn't fetch this provider's model list.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Model</span>
      <Select value={currentModel ?? undefined} onValueChange={(model) => setModel.mutate(model)}>
        <SelectTrigger className="h-7 w-56 text-xs">
          <SelectValue placeholder="Choose a model..." />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AiSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: providers = [] } = useQuery({ queryKey: ["ai-providers"], queryFn: aiListProviders });
  const { data: availability = [] } = useQuery({ queryKey: ["ai-availability"], queryFn: aiAvailability });
  const { data: defaultProviderId } = useQuery({
    queryKey: ["ai-default-provider"],
    queryFn: aiDefaultProviderId,
  });

  const remove = useMutation({
    mutationFn: (id: string) => aiRemoveProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      queryClient.invalidateQueries({ queryKey: ["ai-availability"] });
      queryClient.invalidateQueries({ queryKey: ["ai-default-provider"] });
    },
  });
  const setDefault = useMutation({
    mutationFn: (id: string) => aiSetDefaultProvider(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
      queryClient.invalidateQueries({ queryKey: ["ai-default-provider"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI</DialogTitle>
          <DialogDescription>
            On-device Apple Intelligence works automatically on supported Macs. Add your own
            provider for anything else, or for Windows and Linux.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {providers.map((p) => {
            const status = availability.find((a) => a.id === p.id);
            const usable = status?.usable ?? false;
            const isDefault = p.id === defaultProviderId;
            return (
              <div
                key={p.id}
                className="flex flex-col gap-1 rounded-md border border-input px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {p.kind === "apple-on-device" ? <IconDeviceDesktop size={14} /> : <IconCloud size={14} />}
                    <span className="text-sm">{p.label}</span>
                    <Badge variant={usable ? "secondary" : "outline"}>{usable ? "Ready" : "Not ready"}</Badge>
                    {isDefault && <Badge variant="secondary">Default</Badge>}
                    {usable && p.kind !== "apple-on-device" && !p.defaultModel && <Badge variant="warning">No model selected</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDefault || setDefault.isPending}
                      onClick={() => setDefault.mutate(p.id)}
                    >
                      {isDefault ? "Default" : "Set default"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label={`Remove ${p.label}`}
                      onClick={() => remove.mutate(p.id)}
                    >
                      <IconTrash size={14} />
                    </Button>
                  </div>
                </div>
                {!usable && status?.unusableReason && (
                  <p className="text-xs text-muted-foreground">{status.unusableReason}</p>
                )}
                {usable && p.kind !== "apple-on-device" && <ModelPicker providerId={p.id} currentModel={p.defaultModel} />}
              </div>
            );
          })}
          <AddProviderForm />
        </div>

        <Separator />
        <ProfileSection />
        <Separator />
        <AmbientSection />
      </DialogContent>
    </Dialog>
  );
}
