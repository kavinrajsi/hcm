import { db } from "@/lib/db";
import { formatInstantDay } from "@/lib/format-date";
import { pdfText } from "./resume-text";
import {
  MAX_ATTEMPTS,
  criteriaFor,
  resumeBytes,
  saveScore,
  scoringInstructions,
  waitingForCreditWhere,
} from "./score";

// Resume scoring by an AI app over MCP (HR's Claude), for when the AI
// Gateway has no credit: list what's waiting, hand over the resume text
// with the same brief the Gateway path uses, save the result.

const NOT_SPAM = { OR: [{ honeypot: null }, { honeypot: "" }] };

/** Waiting for credit first, then never scored or retryable; newest first. */
export async function resumesToScore(limit = 25) {
  const select = {
    id: true,
    firstName: true,
    lastName: true,
    jobRole: true,
    createdAt: true,
  } as const;
  const waiting = await db.candidate.findMany({
    where: { AND: [NOT_SPAM, { score: { is: waitingForCreditWhere } }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    select,
  });
  const rest =
    waiting.length < limit
      ? await db.candidate.findMany({
          where: {
            AND: [
              NOT_SPAM,
              {
                OR: [
                  { score: { is: null } },
                  { score: { is: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } } } },
                ],
              },
              { id: { notIn: waiting.map((candidate) => candidate.id) } },
            ],
          },
          orderBy: { createdAt: "desc" },
          take: limit - waiting.length,
          select,
        })
      : [];
  const [waitingCount, unscoredCount] = await Promise.all([
    db.candidate.count({ where: { AND: [NOT_SPAM, { score: { is: waitingForCreditWhere } }] } }),
    db.candidate.count({ where: { AND: [NOT_SPAM, { score: { is: null } }] } }),
  ]);
  return {
    waitingForCredit: waitingCount,
    neverScored: unscoredCount,
    candidates: [...waiting, ...rest].map((candidate) => ({
      candidateId: candidate.id.toString(),
      name: [candidate.firstName, candidate.lastName].filter(Boolean).join(" "),
      role: candidate.jobRole,
      applied: formatInstantDay(candidate.createdAt),
    })),
  };
}

/** The scoring brief and resume text for one candidate. */
export async function resumeForScoring(candidateId: bigint) {
  const candidate = await db.candidate.findFirst({
    where: { AND: [{ id: candidateId }, NOT_SPAM] },
    select: { fileUrl: true, jobRole: true, position: true },
  });
  if (!candidate) return { found: false as const };
  const role = candidate.jobRole?.trim() || null;
  const fileKey = candidate.fileUrl?.trim();
  const noResume = async (summary: string) => {
    await db.candidateScore.upsert({
      where: { candidateId },
      create: { candidateId, status: "NO_RESUME", summary, role, model: "mcp", strengths: [], gaps: [] },
      update: { status: "NO_RESUME", summary, role, error: null },
    });
    return { found: true as const, scorable: false as const, reason: `${summary} Marked "No resume"; nothing to score.` };
  };
  if (!fileKey || !fileKey.toLowerCase().endsWith(".pdf")) {
    return noResume(fileKey ? "Resume isn't a PDF." : "No resume attached.");
  }
  const bytes = await resumeBytes(fileKey);
  if (!bytes) return noResume("Resume file is missing or too large.");
  const resumeText = await pdfText(bytes);
  if (!resumeText) return noResume("Resume has no readable text (a scanned image?).");
  const criteria = await criteriaFor(role);
  return {
    found: true as const,
    scorable: true as const,
    candidateId: candidateId.toString(),
    instructions: scoringInstructions({ role: role ?? "not stated", position: candidate.position, criteria }),
    resumeText,
  };
}

/** Saves a score an AI app produced from resumeForScoring's brief. */
export async function saveScoreFromAi(
  candidateId: bigint,
  input: { score: number; summary: string; strengths: string[]; gaps: string[] },
  clientModel: string,
) {
  const candidate = await db.candidate.findFirst({
    where: { AND: [{ id: candidateId }, NOT_SPAM] },
    select: { jobRole: true },
  });
  if (!candidate) return { saved: false, reason: "No such candidate." };
  const role = candidate.jobRole?.trim() || null;
  const criteria = await criteriaFor(role);
  await saveScore(candidateId, input, { role, model: clientModel, usedCriteria: Boolean(criteria) });
  return { saved: true, candidateId: candidateId.toString(), score: input.score };
}
