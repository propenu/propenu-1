import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Access denied</h1>
      <p className="mt-3 text-sm text-gray-500">
        You do not have permission to open this page.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-[#26ad5f] px-5 py-2 text-sm font-semibold text-white"
      >
        Go to home
      </Link>
    </div>
  );
}
