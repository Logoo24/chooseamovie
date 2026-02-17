export default function Home() {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold">ChooseAMovie</h1>
        <p className="text-gray-700">
          Create a group, share a link, and rate movies together.
        </p>
        <a className="inline-block rounded bg-black px-4 py-2 text-white" href="/create">
          Create a group
        </a>
      </div>
    </main>
  );
}
