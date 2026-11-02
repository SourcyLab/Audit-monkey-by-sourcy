import type { StateModule } from "../engine/types";
export const florida: StateModule = {
  code: "FL",
  name: "Florida · NCCI",
  verify: [
    "Officer minimum/maximum: TODO — obtain applicable NCCI Florida values and effective dates.",
    "Exemptions: verify the individual, entity, trade, eligibility and dates with Florida DWC.",
    "Assessments and expense constant: TODO — use the policy and effective filed values.",
    "Carrier, re-audit and NCCI deadlines: TODO — obtain written confirmation for this policy. Do not assume a complaint extends time.",
  ],
  sources: [
    {
      label: "NCCI Basic Manual / Atlas (licensed access may be required)",
      url: "https://www.ncci.com/Pages/Atlas.aspx",
    },
    {
      label: "NCCI Dispute Resolution Process",
      url: "https://www.ncci.com/Articles/Pages/UW_disputeresolutionprocess.aspx",
    },
    {
      label: "F.S. 440.381 · payroll audit procedures",
      url: "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0440/Sections/0440.381.html",
    },
    {
      label: "Florida DWC · individual exemptions",
      url: "https://www.myfloridacfo.com/division/wc/employer/exemptions",
    },
    {
      label: "Florida audit rule 69O-189.003",
      url: "https://flrules.org/gateway/ruleNo.asp?id=69O-189.003",
    },
    {
      label: "Florida DFS · insurance help",
      url: "https://www.myfloridacfo.com/division/consumers/needourhelp",
    },
    {
      label: "Florida OIR · contact and routing",
      url: "https://www.floir.gov/about-us/contact-us",
    },
    {
      label:
        "ISO / Verisk · premium audit training (background, not a current rating rule)",
      url: "https://www.verisk.com/4a5f82/siteassets/media/downloads/iso/paas/paas-professional-development-catalog.pdf",
    },
  ],
};
