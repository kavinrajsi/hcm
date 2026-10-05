import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentUser } from "@/lib/rbac";
import { isAuthor } from "@/lib/learning/access";
import { isLearningKey, UPLOAD_TYPES, type UploadKind } from "@/lib/learning/files";

// Issues one-time tokens so authors' browsers upload course files straight
// to private Blob storage (no 4.5 MB function body limit; big videos go up
// in parts). The upload form then saves the returned pathname, which the
// save action checks exists. Only the token request is authenticated here:
// Blob's own completion callback carries no cookies and isn't used.

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await currentUser();
        if (!user || !isAuthor(user)) throw new Error("Not allowed to upload course files");
        if (!isLearningKey(pathname)) throw new Error("Uploads must go under learning/");
        const kind = (clientPayload ?? "") as UploadKind;
        const rules = UPLOAD_TYPES[kind];
        if (!rules) throw new Error("Unknown file type");
        return {
          allowedContentTypes: [...rules.contentTypes],
          maximumSizeInBytes: rules.maxBytes,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
