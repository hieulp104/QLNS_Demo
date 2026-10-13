import { Prisma } from "@/generated/prisma/client";

/** Công thức tiền Material dùng chung cho mọi truy vấn server-side. */
export function materialTotalSql(prefix: Prisma.Sql = Prisma.empty) {
  return Prisma.sql`
    ${prefix}"quantity" * COALESCE(${prefix}"unit_price", 0)
    + ${prefix}"additional_cost"
  `;
}
