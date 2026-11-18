import { sheetRoute } from "../../ui/sheet/route.tsx";
import { QuickJotScreen } from "../../screens/QuickJot.tsx";

// A tablet's is the desktop's Quick Jot popover, at what opened it (5.3).
export default sheetRoute("Quick Jot", QuickJotScreen, "large", "picker", true);
