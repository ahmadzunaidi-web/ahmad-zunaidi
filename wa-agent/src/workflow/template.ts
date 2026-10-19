/** `{{$contact.firstname}}`, `{{$var.budget}}`, `{{$trigger.order_id}}` templates for workflow text. */
export interface TemplateContext {
  contact: Record<string, string>;
  vars: Record<string, unknown>;
  trigger: Record<string, unknown>;
}

export function contactVars(c: { name: string | null; wa_id: string; email: string | null; lifecycle: string | null; fields: Record<string, string | number> }): Record<string, string> {
  const name = c.name ?? '';
  const out: Record<string, string> = {
    firstname: name.split(/\s+/)[0] ?? '', lastname: name.split(/\s+/).slice(1).join(' '), name, phone: c.wa_id,
    email: c.email ?? '', lifecycle: c.lifecycle ?? '',
  };
  for (const [k, v] of Object.entries(c.fields)) out[k.toLowerCase().replace(/\s+/g, '')] = String(v);
  return out;
}

const lookup = (obj: Record<string, unknown>, path: string): unknown => {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
};

export function renderTemplate(text: string, ctx: TemplateContext, escape: (s: string) => string = (s) => s): string {
  return text.replace(/\{\{\s*\$(contact|var|trigger)\.([A-Za-z0-9_.]+)\s*\}\}/g, (_m, ns: string, key: string) => {
    const src = ns === 'contact' ? ctx.contact : ns === 'var' ? ctx.vars : ctx.trigger;
    const v = ns === 'contact' ? src[key.toLowerCase()] : lookup(src as Record<string, unknown>, key);
    return escape(v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
}
