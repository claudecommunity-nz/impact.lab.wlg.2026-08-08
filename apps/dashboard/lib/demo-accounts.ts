export const DEMO_PASSWORD = "WellingtonResponse2026!";

export const DEMO_ACCOUNTS = [
  {
    role: "operator",
    label: "Operator",
    email: "operator@demo.impactlab.nz",
    description: "Review evidence and open incidents.",
  },
  {
    role: "controller",
    label: "Controller",
    email: "controller@demo.impactlab.nz",
    description: "Coordinate priorities and incident status.",
  },
  {
    role: "admin",
    label: "Response admin",
    email: "admin@demo.impactlab.nz",
    description: "Demonstrate response-team administration.",
  },
] as const;

export type DemoAccount = (typeof DEMO_ACCOUNTS)[number];

/**
 * These credentials are intentionally public for the hackathon. Setting this
 * build-time flag to `false` removes every demo-account control from the app.
 */
export const DEMO_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_DEMO_AUTH_ENABLED !== "false";
