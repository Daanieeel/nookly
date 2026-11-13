import { type ComponentType, createContext, useContext } from "react";
import { View } from "react-native";
import { mathMarkup } from "../../editor/math.ts";
import { useTheme } from "../theme.ts";
import { TYPE } from "../tokens.ts";
import MathDom from "./MathDom.tsx";

export interface MathViewProps {
  markup: string;
  color: string;
  fontSize: number;
}

function NativeMath(props: MathViewProps) {
  return <MathDom {...props} dom={{ matchContents: true, scrollEnabled: false }} />;
}

/// Where formulas are drawn: a web view on the phone; a test, which has none, supplies a
/// stand in.
const MathViewContext = createContext<ComponentType<MathViewProps>>(NativeMath);
export const MathViewProvider = MathViewContext.Provider;

/// A formula drawn at body size, read out as its source.
export function MathPreview({ latex, macros }: { latex: string; macros: Record<string, string> }) {
  const theme = useTheme();
  const Impl = useContext(MathViewContext);
  return (
    <View accessible accessibilityLabel={latex} style={{ minHeight: 28, justifyContent: "center" }}>
      <Impl
        markup={mathMarkup(latex, macros, false)}
        color={theme.colors.foreground}
        fontSize={TYPE.body.fontSize}
      />
    </View>
  );
}
