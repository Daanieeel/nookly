import type { FixedStatus } from "@nookly/shared/colors";
import type { LabelRecord, Space } from "@nookly/shared/data";
import { View } from "react-native";
import { BADGE } from "../ui/tokens.ts";
import type { Option } from "../ui/sheet/OptionList.tsx";
import { SpaceIcon } from "./SpaceIcon.tsx";
import { StatusIcon } from "./TaskRow.tsx";

/// The options of a picker for things that carry their own colour, each on a badge tinted
/// with it, as iOS tints a Settings row's square (D50): a status, a label, a Space.

export function statusOption(status: FixedStatus): Option {
  return {
    id: status.id,
    label: status.name,
    icon: <StatusIcon status={status} size={BADGE.symbol} />,
    tint: status.color,
  };
}

export function labelOption(label: LabelRecord): Option {
  return {
    id: label.id,
    label: label.name,
    icon: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: label.color }} />,
    tint: label.color,
  };
}

export function spaceOption(space: Space): Option {
  return {
    id: space.id,
    label: space.name,
    icon: <SpaceIcon space={space} size={BADGE.symbol} />,
    tint: space.color,
  };
}
