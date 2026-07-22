/**
 * @wcc-impact/ui — WCC-branded shadcn/ui component kit + design tokens (PLAN §5, §6).
 *
 * The theme is standard shadcn (Tailwind v4, CSS-first) branded with Wellington
 * City Council's palette; import "@wcc-impact/ui/tokens.css" once in the dashboard's
 * globals.css (see that file's header for the exact @import/@source lines).
 *
 * Module UIs don't import @wcc-impact/ui directly — @wcc-impact/plugin-sdk re-exports the
 * component kit and tokens (one import surface for teams).
 *
 * @example
 * import { Button, Card, Badge, cn, SEVERITY_COLORS } from "@wcc-impact/plugin-sdk";
 */

// Design tokens (JS side) + small bespoke components
export { SEVERITY_COLORS, severityColor } from "./tokens";
export { timeAgo } from "./time";
export { SeverityBadge } from "./severity-badge";
export { cn } from "./lib/utils";
export { ModuleIcon, MODULE_ICONS, MODULE_ICON_NAMES } from "./module-icon";

// shadcn/ui component kit
export { Button, buttonVariants } from "./components/ui/button";
export { Badge, badgeVariants } from "./components/ui/badge";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from "./components/ui/card";
export { Input } from "./components/ui/input";
export { Label } from "./components/ui/label";
export { Separator } from "./components/ui/separator";
export { Skeleton } from "./components/ui/skeleton";
export { Toaster } from "./components/ui/sonner";
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip";
export { ScrollArea, ScrollBar } from "./components/ui/scroll-area";
export { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "./components/ui/table";
