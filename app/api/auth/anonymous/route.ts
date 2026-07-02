import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      return new NextResponse(null, { status: 204 });
    }

    const { error } = await supabase.auth.signInAnonymously();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to initialize anonymous authentication.",
      },
      { status: 500 },
    );
  }
}
