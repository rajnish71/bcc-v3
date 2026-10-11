// "Draft Photographs" Studio sidebar item: deep link into the existing
// Portfolio page's Drafts filter (no new page, API or backend).
import { readFileSync } from 'fs';
import { join } from 'path';

const FE = join(__dirname, '../../../../frontend/src');
const SIDEBAR = readFileSync(join(FE, 'components/hub/HubSidebar.astro'), 'utf8');
const PORTFOLIO = readFileSync(join(FE, 'pages/hub/portfolio/index.astro'), 'utf8');
const SERVICE = readFileSync(join(__dirname, 'gallery.service.ts'), 'utf8');

describe('Draft Photographs sidebar item', () => {
  it('sits in the STUDIO group between Portfolio and Upload Studio', () => {
    const studio = SIDEBAR.slice(SIDEBAR.indexOf("label: 'STUDIO'"), SIDEBAR.indexOf("label: 'GROW'"));
    const order = ['Portfolio', 'Draft Photographs', 'Upload Studio'].map(n => studio.indexOf(`name: '${n}'`));
    expect(order.every(i => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(SIDEBAR).toContain("const DRAFTS_HREF = '/hub/portfolio/?status=drafts'");
  });

  it('takes Portfolio\'s active state only on ?status=drafts', () => {
    expect(SIDEBAR).toContain('if (href === DRAFTS_HREF) return false;');
    expect(SIDEBAR).toMatch(/get\('status'\) === 'drafts'/);
  });

  it('the Portfolio page preselects the Drafts filter from the query string', () => {
    expect(PORTFOLIO).toMatch(/get\('status'\)[\s\S]*\['published', 'drafts', 'archived'\]\.includes\(wanted\)/);
    expect(PORTFOLIO).toContain("function isDraft(p: Photo)      { return p.visibility === 'PRIVATE'; }");
  });

  it('data source stays the owner-scoped list (own photos only)', () => {
    expect(PORTFOLIO).toContain('${API}/gallery/photos?limit=200');
    const ctrl = readFileSync(join(__dirname, 'gallery.controller.ts'), 'utf8');
    expect(ctrl).toMatch(/owner_user_id: req\.user\.sub/);
  });

  it('draft->public is a PATCH visibility change; the Basic cap applies to portfolio_selected, not visibility', () => {
    expect(PORTFOLIO).toContain("const patch: Record<string, unknown> = { title, description, exhibition_label, visibility, show_in_portfolio };");
    expect(PORTFOLIO).toContain('if (slotsApply()) patch.portfolio_selected = portfolio_selected;');
    expect(SERVICE).toContain('CAP_REACHED');
    const upd = SERVICE.slice(SERVICE.indexOf('async updatePhoto'), SERVICE.indexOf('Portfolio slots (MEM-008'));
    expect(upd).toContain('setPortfolioSelection');
    expect(upd).not.toMatch(/visibility[^\n]*CAP/);
  });
});
