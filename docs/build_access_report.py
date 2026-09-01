from html.parser import HTMLParser
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

OUTPUT = "docs/Daiichi-User-Roles-and-Access-Control-Report.pdf"
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleGreen", parent=styles["Title"], textColor=colors.HexColor("#164f3e"), fontSize=23, leading=27, spaceAfter=5))
styles.add(ParagraphStyle(name="H2Green", parent=styles["Heading2"], textColor=colors.HexColor("#164f3e"), fontSize=14, leading=17, spaceBefore=12, spaceAfter=7))
styles.add(ParagraphStyle(name="SmallBody", parent=styles["BodyText"], fontSize=8.5, leading=11))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], backColor=colors.HexColor("#fff7e8"), borderColor=colors.HexColor("#d68c2e"), borderWidth=1, borderPadding=7, fontSize=9, leading=12))

def p(text, style="BodyText"):
    return Paragraph(text, styles[style])

def table(headers, rows, widths=None):
    data = [[p(f"<b>{x}</b>", "SmallBody") for x in headers]] + [[p(str(x), "SmallBody") for x in row] for row in rows]
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#164f3e")), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("GRID", (0,0), (-1,-1), .35, colors.HexColor("#cfd9d4")), ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f6f8f7")])
    ])); return t

story = [p("Daiichi Retell AI Dashboard", "TitleGreen"), p("User Roles, Page Access and Permission Audit", "Heading3"), p("Current implementation", "SmallBody"), Spacer(1, 8)]
story += [p("1. Access Model", "H2Green"), p("The application has two role systems: <b>platform roles</b> for Daiichi staff and <b>tenant roles</b> for client workspace users. Effective access is the union of applicable roles, restricted by profile status, active membership, tenant scope, individual agent grants, server permission checks and Supabase Row-Level Security.")]
story += [p("2. Client Workspace Roles", "H2Green"), table(["Role","Granted capabilities","Management"],[
    ["Owner","Agents, calls, chats, transcripts, recording playback, analytics and billing read","Read-only"], ["Admin","Same as Owner","Read-only"],
    ["Manager","Agents, calls, chats, transcripts, recordings and analytics","Read-only"], ["Analyst","Agents, calls, chats and analytics","Read-only"],
    ["Viewer","Agents, calls, chats and analytics; initiate/respond permissions exist","No management UI"], ["Billing","Tenant and billing read","No usable dashboard page"]], [23*mm,92*mm,38*mm])]
story += [p("Client Page Visibility", "Heading3"), table(["Page","Permission","Owner/Admin","Manager","Analyst","Viewer","Billing"],[
    ["Home","analytics.read","Yes","Yes","Yes","Yes","No"],["Agents","agents.read","Yes","Yes","Yes","Yes","No"],["Phone Numbers","agents.read","Yes","Yes","Yes","Yes","No"],
    ["Call History","calls.read","Yes","Yes","Yes","Yes","No"],["Chat History","chats.read","Yes","Yes","Yes","Yes","No"],["Contacts","calls.read","Yes","Yes","Yes","Yes","No"],
    ["Analytics","analytics.read","Yes","Yes","Yes","Yes","No"],["Team","members.read","No","No","No","No","No"]], [29*mm,29*mm,23*mm,20*mm,20*mm,20*mm,18*mm]),
    p("<b>Agent-level restriction:</b> Client users see only agents with active individual grants. Calls, chats, contacts, analytics, phone numbers, metrics and charts are filtered to those agents.", "Callout")]
story += [PageBreak(), p("3. Platform Roles", "H2Green"), table(["Role","Can view","Can manage","Restrictions"],[
    ["Super Admin","All platform and tenant data","All functions","None in permission model"],
    ["Operations Admin","Tenants, members, agents, calls, chats, transcripts, recordings, analytics, audit","Tenants, members, agents, Retell, reconciliation, exports","No platform-admin or billing management"],
    ["Agent Engineer","Tenants, agents, calls, chats, transcripts, recordings, analytics","Agents","Cannot run full import"],
    ["Quality Analyst","Tenants, agents, calls, chats, transcripts, recordings, analytics","Report export","No operational management"],
    ["Support","Tenants, members, agents, calls, chats, analytics","None","No transcripts, recordings or exports"],
    ["Billing Admin","Tenants, billing, analytics, audit","Billing","Cannot enter Owner Dashboard"],
    ["Auditor","Tenants, agents, analytics, billing, audit","None","No formal call/chat permission"]], [27*mm,55*mm,48*mm,42*mm])]
story += [p("4. Platform Control Center", "H2Green"), p("Opening <b>/admin</b> requires <b>tenants.read</b>. All current platform roles have this permission."), table(["Operation","Required access"],[
    ["View Control Center","tenants.read"],["Sync Retell data","agents.manage + retell_connections.manage"],["Manage platform administrators","super_admin"],
    ["Manage client users","members.manage"],["Grant/revoke agent access","members.manage + agents.manage"],["Assign agents","agents.manage"],
    ["View as client user","members.manage"],["Manage invoices","billing.manage"],["Manage contacts, fields and backfills","retell_connections.manage"]], [95*mm,70*mm])]
story += [p("5. Security Behavior", "H2Green"), p("• Inactive or suspended profiles cannot use the application.<br/>• Only active memberships are accepted.<br/>• Platform roles may be global or tenant-scoped.<br/>• Tenant-scoped roles do not apply to other tenants.<br/>• Each agent can have only one active tenant assignment.<br/>• Agent grants can be revoked without deleting history.<br/>• Calls and chats are tenant-scoped and protected by server checks and RLS.<br/>• Unauthorized protected routes generally return not-found.<br/>• Administrative mutations create audit records where implemented.")]
story += [PageBreak(), p("6. Current Authorization Gaps", "H2Green"), p("1. <b>Owner and Admin are read-only</b> despite their administrative names.<br/>2. <b>Billing users have no usable billing page</b> and may receive a not-found dashboard.<br/>3. <b>No tenant role can open Team</b> because none receives members.read.<br/>4. Viewer has calls.initiate and chats.respond while senior roles do not.<br/>5. Permission overrides are stored but not applied by the authorization context.<br/>6. <b>Owner Dashboard overexposure:</b> all views are returned after only agents.read is accepted.<br/>7. Contact management controls may be visible when the protected API will reject the action.<br/>8. Control Center summaries are visible to every platform role.<br/>9. Tenant recording flags are not applied by the dashboard loader.<br/>10. contacts.view_unmasked has no implemented workflow.<br/>11. Some exports are not hidden when reports.export is absent.<br/>12. Agent Version analytics is unavailable because version is missing from call data.")]
story += [p("7. Recommended Priority", "H2Green"), p("1. Apply page-level permissions to Owner Dashboard.<br/>2. Hide unauthorized management controls.<br/>3. Define meaningful differences for Owner, Admin and Manager.<br/>4. Create a billing page for Billing users.<br/>5. Apply membership permission overrides.<br/>6. Enforce recording, transcript, export and contact-unmasking settings.<br/>7. Add automated access tests for every role and route.")]

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(colors.HexColor("#71817c")); canvas.drawString(16*mm, 9*mm, "Daiichi Retell AI Dashboard — Access Control Report"); canvas.drawRightString(194*mm, 9*mm, f"Page {doc.page}"); canvas.restoreState()

doc = SimpleDocTemplate(OUTPUT, pagesize=A4, rightMargin=16*mm, leftMargin=16*mm, topMargin=15*mm, bottomMargin=16*mm, title="Daiichi User Roles and Access Control Report", author="Daiichi Retell AI Dashboard")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
