import { fileWithOrigin, importFileWithDetails } from "@nookly/shared/data";
import { fileSize, fileTypeLabel } from "@nookly/shared/moodle/format";
import {
  matchCourse,
  originOf,
  suggestLabelNames,
  suggestTitles,
} from "@nookly/shared/moodle/import";
import { moodleWebUrl } from "@nookly/shared/moodle/path";
import { IconFileImport, IconTag, IconX } from "@tabler/icons-react-native";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useDb, useLocalWrite } from "../data/context.tsx";
import { keys } from "../data/keys.ts";
import { useCourses, useLabels } from "../data/queries.ts";
import type { MoodleCourse, RemoteFile } from "../moodle/api.ts";
import { moodleDay } from "../moodle/format.ts";
import {
  useMoodleConnection,
  useMoodleContents,
  useMoodleCourses,
  useMoodleDownload,
} from "../moodle/queries.ts";
import { useMoodleService } from "../moodle/service.tsx";
import { Button, statusOf } from "../ui/Button.tsx";
import { Chip, ChipGroup } from "../ui/Chips.tsx";
import { Field } from "../ui/Field.tsx";
import { FormSection } from "../ui/kit/Form.tsx";
import { EmptyState, LoadingState } from "../ui/kit/States.tsx";
import { SelectField, SheetTrigger } from "../ui/SelectField.tsx";
import { type Option, OptionList } from "../ui/sheet/OptionList.tsx";
import { Sheet } from "../ui/sheet/Sheet.tsx";
import { Text } from "../ui/Text.tsx";
import { useTheme } from "../ui/theme.ts";
import { FileContents } from "./FileViewer.tsx";
import { viewerForName } from "./file-kinds.ts";
import { OpenInMoodle } from "./MoodleParts.tsx";
import { courseOption, labelOption } from "./option-badges.tsx";

/// A file of the site read in Nookly, as the desktop's `FilePage` and `MoodleImport`:
/// downloaded once into the phone's own folder, shown in Nookly's viewer, offered to other
/// apps, and imported into a Space as a File of its own, named, labelled and attached to its
/// course in one go.

/// Which file: one of a course item's (found again in the course's contents), or one handed
/// over whole (an assignment's or a post's attachment).
export type MoodleFileTarget =
  | { courseId: number; spaceId?: string; cmid: number; index: number }
  | { courseId: number; spaceId?: string; file: RemoteFile };

export function fileRoute(target: MoodleFileTarget): string {
  const params = new URLSearchParams({ courseId: String(target.courseId) });
  if (target.spaceId) params.set("spaceId", target.spaceId);
  if ("file" in target) {
    params.set("url", target.file.fileurl);
    params.set("name", target.file.filename);
    params.set("time", String(target.file.timemodified));
    params.set("size", String(target.file.filesize));
  } else {
    params.set("cmid", String(target.cmid));
    params.set("index", String(target.index));
  }
  return `/moodle/file?${params.toString()}`;
}

/// Where the file sits in the course, to suggest a name, labels and a course for it.
interface FileContext {
  file: RemoteFile;
  title: string;
  sectionName?: string;
  itemName?: string;
}

function useFileContext(
  courseId: number,
  place: { cmid?: number; index?: number; file?: RemoteFile },
) {
  const contents = useMoodleContents(courseId);
  if (place.file) return { context: { file: place.file, title: place.file.filename }, contents };
  for (const section of contents.data?.data ?? []) {
    const module = section.modules.find((m) => m.id === place.cmid);
    const file = module?.contents[place.index ?? -1];
    if (!module || !file) continue;
    const files = module.contents.filter((f) => f.type === "file");
    const single = files.length === 1 && module.modname !== "folder";
    const context: FileContext = {
      file,
      title: single ? module.name : file.filename,
      sectionName: section.name,
      itemName: single ? module.name : undefined,
    };
    return { context, contents };
  }
  return { context: null, contents };
}

/// The File already imported from this file, if there is one.
function useImported(file: RemoteFile | null) {
  const db = useDb();
  const origin = file ? originOf({ fileName: file.filename, fileUrl: file.fileurl }) : "";
  return useQuery({
    queryKey: keys.fileWithOrigin(origin),
    queryFn: () => fileWithOrigin(db, origin),
    enabled: origin !== "",
  });
}

export function MoodleFileScreen({
  courseId,
  spaceId,
  cmid,
  index,
  file: given,
}: {
  courseId: number;
  spaceId?: string;
  cmid?: number;
  index?: number;
  file?: RemoteFile;
}) {
  const router = useRouter();
  const theme = useTheme();
  const { data: connection } = useMoodleConnection();
  const course = useMoodleCourses().data?.data.find((c) => c.id === courseId);
  const { context, contents } = useFileContext(courseId, { cmid, index, file: given });
  const download = useMoodleDownload(context?.file);
  const imported = useImported(context?.file ?? null);
  const [importing, setImporting] = useState(false);
  if (!context) {
    if (contents.error || contents.data) {
      return (
        <EmptyState
          title="This file is gone"
          message={contents.error?.message ?? "Moodle no longer lists it in this course."}
        />
      );
    }
    return <LoadingState label="Getting the file from Moodle" />;
  }
  const { file } = context;
  const webUrl =
    connection && cmid
      ? moodleWebUrl(connection.site.root, { page: "file", courseId, cmid, index: index ?? 0 })
      : null;
  const existing = imported.data ?? null;
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: context.title }} />
      {download.error ? (
        <EmptyState
          title="Nookly couldn't get this file"
          message={download.error.message}
          action={{ label: "Try Again", onPress: () => void download.refetch() }}
        />
      ) : (
        <FileContents
          name={file.filename}
          path={download.data ?? null}
          kind={viewerForName(file.filename)}
          missing="Getting the file from Moodle…"
        />
      )}
      <View className="gap-2 border-t border-border px-4 pt-3 pb-8">
        <Text variant="small" tone="muted">
          {[
            fileTypeLabel(file.filename),
            file.filesize > 0 ? fileSize(file.filesize) : null,
            moodleDay(file.timemodified),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          {existing ? (
            <Button
              label="Show in Nookly"
              variant="secondary"
              onPress={() => router.push(`/entity/${existing}`)}
            />
          ) : spaceId && download.data ? (
            <Button
              label="Import to Nookly"
              variant="secondary"
              icon={<IconFileImport size={16} color={theme.colors.foreground} />}
              onPress={() => setImporting(true)}
            />
          ) : null}
          <OpenInMoodle url={webUrl} />
        </View>
      </View>
      {spaceId && download.data ? (
        <Sheet open={importing} onOpenChange={setImporting} title="Import to Nookly">
          {importing ? (
            <ImportForm
              spaceId={spaceId}
              context={context}
              course={course}
              localUri={download.data}
              onDone={() => setImporting(false)}
            />
          ) : null}
        </Sheet>
      ) : null}
    </View>
  );
}

const NO_COURSE = "none";

/// A label the Space does not have yet: picked by its name, made when the import goes through.
const NEW = "new:";

/// The form an import goes through: the File's name (Moodle's name for the item first), its
/// labels (the course, then its section) and the course of Nookly it belongs to.
function ImportForm({
  spaceId,
  context,
  course,
  localUri,
  onDone,
}: {
  spaceId: string;
  context: FileContext;
  course: MoodleCourse | undefined;
  localUri: string;
  onDone: () => void;
}) {
  const service = useMoodleService();
  const { data: labels = [] } = useLabels(spaceId);
  const { data: courses = [] } = useCourses(spaceId);
  const fileRef = { fileName: context.file.filename, fileUrl: context.file.fileurl };
  const titles = suggestTitles(fileRef, context.itemName);
  const moodleCourse = course
    ? { shortName: course.shortname, fullName: course.fullname }
    : undefined;
  const suggested = moodleCourse ? suggestLabelNames(moodleCourse, context.sectionName) : [];
  const existingFor = (name: string) =>
    labels.find((l) => l.name.trim().toLowerCase() === name.trim().toLowerCase());
  const [title, setTitle] = useState(titles[0] ?? context.file.filename);
  const [picked, setPicked] = useState<string[]>(() =>
    suggested.map((name) => existingFor(name)?.id ?? `${NEW}${name}`),
  );
  const [typed, setTyped] = useState<string[]>([]);
  const matched = moodleCourse
    ? matchCourse(
        courses.map((c) => ({ id: c.entity.id, title: c.entity.title })),
        moodleCourse,
      )
    : undefined;
  const [courseId, setCourseId] = useState<string | null>(null);
  const attachTo = courseId ?? matched?.id ?? NO_COURSE;
  const [choosing, setChoosing] = useState(false);
  const drafts = [...new Set([...suggested, ...typed])].filter((n) => !existingFor(n));
  const options: Option[] = [
    ...labels.map(labelOption),
    ...drafts.map((name) => ({ id: `${NEW}${name}`, label: name, glyph: IconTag, tint: "gray" })),
  ];
  const nameOf = (id: string) =>
    id.startsWith(NEW) ? id.slice(NEW.length) : (labels.find((l) => l.id === id)?.name ?? "");
  const save = useLocalWrite(async (db, _: undefined) => {
    const stored = await service.store(localUri);
    return importFileWithDetails(db, spaceId, {
      filename: stored.name,
      localPath: stored.uri,
      title,
      origin: originOf(fileRef),
      labelIds: picked.filter((id) => !id.startsWith(NEW)),
      newLabels: picked.filter((id) => id.startsWith(NEW)).map(nameOf),
      attachTo: attachTo === NO_COURSE ? [] : [attachTo],
    });
  });
  const others = titles.filter((t) => t !== title);
  return (
    <View className="gap-4">
      <FormSection>
        <Field label="Name" value={title} onChangeText={setTitle} returnKeyType="done" />
      </FormSection>
      {others.length > 0 ? (
        <ChipGroup label="Other names" scroll>
          {others.map((t) => (
            <Chip key={t} label={t} selected={false} onPress={() => setTitle(t)} />
          ))}
        </ChipGroup>
      ) : null}
      <FormSection>
        <SheetTrigger
          label="Labels"
          text={picked.length > 0 ? picked.map(nameOf).join(", ") : null}
          placeholder="None"
          onPress={() => setChoosing(true)}
        />
        <Sheet open={choosing} onOpenChange={setChoosing} title="Labels" presentation="card">
          <OptionList
            label="Labels"
            multiple
            values={picked}
            options={options}
            onCreate={(name) => {
              const existing = existingFor(name);
              setTyped((all) => [...all, name.trim()]);
              setPicked((all) => [...all, existing?.id ?? `${NEW}${name.trim()}`]);
            }}
            onToggle={(id, on) =>
              setPicked((all) => (on ? [...all, id] : all.filter((x) => x !== id)))
            }
          />
        </Sheet>
        <SelectField
          label="Course"
          value={attachTo}
          onChange={setCourseId}
          options={[
            { id: NO_COURSE, label: "No course", glyph: IconX, tint: "gray" },
            ...courses.map(courseOption),
          ]}
        />
      </FormSection>
      {save.error ? <Text tone="destructive">{save.error.message}</Text> : null}
      <Button
        label="Import"
        size="lg"
        disabled={!title.trim()}
        status={statusOf(save)}
        onPress={() => save.mutate(undefined, { onSuccess: onDone })}
      />
    </View>
  );
}
