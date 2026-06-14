import type { FastifyInstance } from "fastify";
import { AvatarUpdateSchema, type AvatarDto } from "@talkhub/shared";
import { prisma } from "../db.js";

function toDto(av: { bits: Uint8Array; color: string }): AvatarDto {
  return { bits: Buffer.from(av.bits).toString("base64"), color: av.color };
}

export async function avatarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/avatar/me", { preHandler: [app.authenticate] }, async (req) => {
    const av = await prisma.avatar.findUnique({ where: { userId: req.user.sub } });
    return { avatar: av ? toDto(av) : null };
  });

  app.put("/avatar/me", { preHandler: [app.authenticate] }, async (req) => {
    const body = AvatarUpdateSchema.parse(req.body);
    const bits = Buffer.from(body.bits, "base64");
    const av = await prisma.avatar.upsert({
      where: { userId: req.user.sub },
      create: { userId: req.user.sub, bits, color: body.color },
      update: { bits, color: body.color },
    });
    return { avatar: toDto(av) };
  });
}
