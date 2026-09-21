import { redirect } from "next/navigation";

// The per-email report lives in the batches workspace, which reads real data.
// Kept so existing /emails/<id> links keep working.
export default async function EmailPage(props: PageProps<"/emails/[emailId]">) {
  const { emailId } = await props.params;
  redirect(`/batches?email=${encodeURIComponent(emailId)}`);
}
