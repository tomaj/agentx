import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">agentx</h1>
      <Link href="/login" className="mt-4 text-primary underline underline-offset-4">
        Go to Login
      </Link>
    </main>
  );
}
