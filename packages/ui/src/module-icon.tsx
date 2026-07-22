import {
  Activity,
  AlertTriangle,
  Ambulance,
  Anchor,
  Bell,
  Box,
  Bus,
  Building2,
  Camera,
  Car,
  CloudRain,
  Droplets,
  Flame,
  Fuel,
  Gauge,
  Heart,
  LifeBuoy,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Mountain,
  Navigation,
  Phone,
  Plane,
  Radio,
  RadioTower,
  SatelliteDish,
  Ship,
  Shield,
  Siren,
  Sprout,
  TrainFront,
  TreePine,
  TriangleAlert,
  Users,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated professional icon set for module manifests (no emoji). A module's
 * `icon` is one of these kebab-case names; unknown/missing names fall back to a
 * neutral box. Keep this list the source of truth documented in the
 * create-module skill.
 */
export const MODULE_ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  "alert-triangle": AlertTriangle,
  ambulance: Ambulance,
  anchor: Anchor,
  bell: Bell,
  box: Box,
  bus: Bus,
  building: Building2,
  camera: Camera,
  car: Car,
  "cloud-rain": CloudRain,
  droplets: Droplets,
  flame: Flame,
  fuel: Fuel,
  gauge: Gauge,
  heart: Heart,
  "life-buoy": LifeBuoy,
  map: MapIcon,
  "map-pin": MapPin,
  "message-square": MessageSquare,
  mountain: Mountain,
  navigation: Navigation,
  phone: Phone,
  plane: Plane,
  radio: Radio,
  "radio-tower": RadioTower,
  "satellite-dish": SatelliteDish,
  ship: Ship,
  shield: Shield,
  siren: Siren,
  sprout: Sprout,
  train: TrainFront,
  "tree-pine": TreePine,
  "triangle-alert": TriangleAlert,
  users: Users,
  waves: Waves,
  wind: Wind,
  zap: Zap,
};

/** The names teams can choose from (for docs / validation messages). */
export const MODULE_ICON_NAMES = Object.keys(MODULE_ICONS);

/**
 * Render a module's icon by name. Falls back to a neutral box for an unknown or
 * missing name, so a bad manifest value never breaks the UI.
 *
 * @example <ModuleIcon name="radio-tower" className="size-4" />
 */
export function ModuleIcon({
  name,
  className,
}: {
  name?: string | null;
  className?: string;
}) {
  const Icon = (name && MODULE_ICONS[name]) || Box;
  return <Icon className={className} aria-hidden />;
}
