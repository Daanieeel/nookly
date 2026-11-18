import { useLocalSearchParams } from "expo-router";
import { MoodleFileScreen } from "../../screens/MoodleFile.tsx";

const number = (value: string | undefined) => (value === undefined ? undefined : Number(value));

export default function MoodleFile() {
  const params = useLocalSearchParams<{
    courseId: string;
    spaceId?: string;
    cmid?: string;
    index?: string;
    url?: string;
    name?: string;
    time?: string;
    size?: string;
  }>();
  const file = params.url
    ? {
        type: "file",
        filename: params.name ?? "File",
        filepath: "/",
        filesize: number(params.size) ?? 0,
        fileurl: params.url,
        timemodified: number(params.time) ?? 0,
        mimetype: "",
      }
    : undefined;
  return (
    <MoodleFileScreen
      courseId={Number(params.courseId)}
      spaceId={params.spaceId}
      cmid={number(params.cmid)}
      index={number(params.index)}
      file={file}
    />
  );
}
