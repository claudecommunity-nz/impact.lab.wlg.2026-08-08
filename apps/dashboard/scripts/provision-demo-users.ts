import { createClient, type User } from "@supabase/supabase-js";
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
} from "../lib/demo-accounts";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const remove = process.argv.includes("--remove");

async function main() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Set SUPABASE_URL and the server-only SUPABASE_SERVICE_ROLE_KEY before running this command.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const usersByEmail = new Map(
    listed.users
      .filter((user): user is User & { email: string } => Boolean(user.email))
      .map((user) => [user.email.toLowerCase(), user]),
  );

  for (const account of DEMO_ACCOUNTS) {
    const existing = usersByEmail.get(account.email.toLowerCase());

    if (remove) {
      if (!existing) {
        console.log(`SKIP ${account.role}: no user for ${account.email}`);
        continue;
      }
      if (existing.app_metadata.demo_account !== true) {
        throw new Error(
          `Refusing to remove ${account.email}: it is not marked as a demo account.`,
        );
      }
      const { error } = await admin.auth.admin.deleteUser(existing.id);
      if (error) throw error;
      console.log(`REMOVED ${account.role}: ${account.email}`);
      continue;
    }

    let user: User;
    if (existing) {
      const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        app_metadata: {
          ...existing.app_metadata,
          demo_account: true,
          demo_response_role: account.role,
        },
      });
      if (error) throw error;
      user = data.user;
      console.log(`UPDATED ${account.role}: ${account.email}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        app_metadata: {
          demo_account: true,
          demo_response_role: account.role,
        },
      });
      if (error) throw error;
      user = data.user;
      console.log(`CREATED ${account.role}: ${account.email}`);
    }

    const { error: roleError } = await admin.rpc("set_response_member", {
      target_user_id: user.id,
      target_role: account.role,
    });
    if (roleError) throw roleError;

    const verifier = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: account.email,
      password: DEMO_PASSWORD,
    });
    if (signInError) throw signInError;

    const { data: access, error: accessError } =
      await verifier.rpc("response_access");
    if (
      accessError ||
      !access ||
      access.authorized !== true ||
      access.role !== account.role
    ) {
      throw accessError ?? new Error(`Role verification failed for ${account.email}`);
    }
    await verifier.auth.signOut();
    console.log(`VERIFIED ${account.role}: password login + response access`);
  }

  console.log(remove ? "Demo users removed." : "All demo users are ready.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
