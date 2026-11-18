import { Pressable, type PressableProps } from "react-native";
import { cn } from "./classes.ts";
import { usePointer } from "./pointer.ts";

/// A `Pressable` that lights up under an iPad's pointer (`hoverClassName`) and does
/// `onSecondary` on a secondary click (its menu), as the desktop's rows do (10.2).
export function PointerPressable({
  hoverClassName = "bg-accent/50",
  onSecondary,
  className,
  ...props
}: PressableProps & { className?: string; hoverClassName?: string; onSecondary?: () => void }) {
  const pointer = usePointer(onSecondary);
  return (
    <Pressable
      {...props}
      {...pointer.handlers}
      className={cn(className, pointer.hovered && hoverClassName)}
    />
  );
}
