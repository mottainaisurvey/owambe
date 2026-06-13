import fs from 'fs';
import path from 'path';

describe('properties host route declaration safety', () => {
  const sourcePath = path.join(__dirname, '..', 'routes', 'properties.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');

  const indexOfDeclaration = (route: string) => {
    const index = source.indexOf(`router.get('${route}'`);
    if (index === -1) {
      throw new Error(`Missing route declaration for ${route}`);
    }
    return index;
  };

  it('declares static /host/bookings before dynamic /host/:id', () => {
    expect(indexOfDeclaration('/host/bookings')).toBeLessThan(indexOfDeclaration('/host/:id'));
  });

  it('declares static /host/dashboard-stats before dynamic /host/:id', () => {
    expect(indexOfDeclaration('/host/dashboard-stats')).toBeLessThan(indexOfDeclaration('/host/:id'));
  });

  it('guards /host/:id against malformed non-UUID values before Prisma lookup', () => {
    const hostIdRouteIndex = indexOfDeclaration('/host/:id');
    const routeSource = source.slice(hostIdRouteIndex, source.indexOf("// ─── GET /api/properties/calendar-entries", hostIdRouteIndex));
    const uuidGuardIndex = routeSource.indexOf('UUID_REGEX.test(id)');
    const prismaLookupIndex = routeSource.indexOf('prisma.property.findUnique');

    expect(uuidGuardIndex).toBeGreaterThan(-1);
    expect(prismaLookupIndex).toBeGreaterThan(-1);
    expect(uuidGuardIndex).toBeLessThan(prismaLookupIndex);
    expect(routeSource).toContain("throw new AppError('Invalid property ID', 400)");
  });
});
