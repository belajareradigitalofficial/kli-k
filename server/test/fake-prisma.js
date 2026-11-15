/**
 * Fake Prisma minimal untuk tes: meniru bagian API yang dipakai service
 * auth & link, termasuk constraint unik dan relasi.
 */
export function createFakePrisma() {
  const users = new Map(); // id -> user
  const usersByEmail = new Map(); // email -> id
  const sessions = new Map(); // tokenHash -> session
  const links = new Map(); // id -> link
  const linksBySlug = new Map(); // slug -> id
  const visits = [];

  let userSeq = 0;
  let linkSeq = 0;
  let visitSeq = 0;

  const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
  const p2025 = () => Object.assign(new Error("Record not found"), { code: "P2025" });

  const db = {
    user: {
      async create({ data, select }) {
        if (usersByEmail.has(data.email)) throw p2002();
        userSeq += 1;
        const now = new Date();
        const user = {
          id: `user_${userSeq}`,
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          createdAt: now,
          updatedAt: now,
        };
        users.set(user.id, user);
        usersByEmail.set(user.email, user.id);
        return select ? pick(user, select) : user;
      },
      async findUnique({ where }) {
        if (where.email) {
          const id = usersByEmail.get(where.email);
          return id ? users.get(id) : null;
        }
        return users.get(where.id) ?? null;
      },
    },

    session: {
      async create({ data }) {
        if (sessions.has(data.tokenHash)) throw p2002();
        const session = { id: `sess_${sessions.size + 1}`, ...data, createdAt: new Date() };
        sessions.set(data.tokenHash, session);
        return session;
      },
      async findUnique({ where, include }) {
        const session = sessions.get(where.tokenHash);
        if (!session) return null;
        if (!include?.user) return session;
        const user = users.get(session.userId);
        return { ...session, user: { id: user.id, name: user.name, email: user.email } };
      },
      async delete({ where }) {
        for (const [k, v] of sessions) {
          if (v.id === where.id) sessions.delete(k);
        }
        return { id: where.id };
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const [k, v] of sessions) {
          if (v.tokenHash === where.tokenHash) {
            sessions.delete(k);
            count += 1;
          }
        }
        return { count };
      },
    },

    link: {
      async create({ data }) {
        if (linksBySlug.has(data.slug)) throw p2002();
        linkSeq += 1;
        const now = new Date();
        const link = {
          id: `link_${linkSeq}`,
          slug: data.slug,
          targetUrl: data.targetUrl,
          title: data.title ?? null,
          description: data.description ?? null,
          isActive: data.isActive ?? true,
          expiresAt: data.expiresAt ?? null,
          clicks: 0,
          userId: data.userId ?? null,
          createdAt: now,
          updatedAt: now,
        };
        links.set(link.id, link);
        linksBySlug.set(link.slug, link.id);
        return link;
      },
      async findUnique({ where }) {
        if (where.slug) {
          const id = linksBySlug.get(where.slug);
          return id ? links.get(id) : null;
        }
        return links.get(where.id) ?? null;
      },
      async findFirst({ where }) {
        for (const link of links.values()) {
          if (link.id === where.id && link.userId === where.userId) return link;
        }
        return null;
      },
      async findMany({ where, skip = 0, take = 20 }) {
        let items = [...links.values()].filter((l) => l.userId === where.userId);
        if (where.OR) {
          const term = where.OR[0].slug.contains.toLowerCase();
          items = items.filter(
            (l) =>
              l.slug.toLowerCase().includes(term) ||
              l.targetUrl.toLowerCase().includes(term) ||
              (l.title ?? "").toLowerCase().includes(term),
          );
        }
        items.sort((a, b) => b.createdAt - a.createdAt);
        return items.slice(skip, skip + take);
      },
      async count({ where }) {
        return [...links.values()].filter(
          (l) => l.userId === where.userId && (where.isActive === undefined || l.isActive === where.isActive),
        ).length;
      },
      async aggregate({ where }) {
        const owned = [...links.values()].filter((l) => l.userId === where.userId);
        return { _sum: { clicks: owned.reduce((s, l) => s + l.clicks, 0) } };
      },
      async update({ where, data }) {
        const link = links.get(where.id);
        if (!link) throw p2025();

        if (data.slug !== undefined && data.slug !== link.slug) {
          if (linksBySlug.has(data.slug)) throw p2002();
          linksBySlug.delete(link.slug);
          linksBySlug.set(data.slug, link.id);
        }

        if (data.clicks?.increment) link.clicks += data.clicks.increment;
        for (const [k, v] of Object.entries(data)) {
          if (k !== "clicks") link[k] = v;
        }
        link.updatedAt = new Date();
        return link;
      },
      async delete({ where }) {
        const link = links.get(where.id);
        if (!link) throw p2025();
        links.delete(where.id);
        linksBySlug.delete(link.slug);
        return link;
      },
    },

    visit: {
      async create({ data }) {
        visitSeq += 1;
        const visit = { id: BigInt(visitSeq), createdAt: new Date(), ...data };
        visits.push(visit);
        return visit;
      },
      async findMany({ where }) {
        return visits.filter((v) => v.linkId === where.linkId).slice().reverse();
      },
      async groupBy({ where }) {
        const seen = new Set();
        for (const v of visits) if (v.linkId === where.linkId) seen.add(v.ip);
        return [...seen].map((ip) => ({ ip }));
      },
    },

    async $transaction(arg) {
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg(db);
    },

    _users: users,
    _links: links,
    _visits: visits,
  };

  return db;
}

function pick(obj, select) {
  const out = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = obj[key];
  }
  return out;
}
