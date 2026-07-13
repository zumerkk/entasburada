import { ArrowRight } from "lucide-react";

interface InformationSection {
  title: string;
  description: string;
  bullets?: string[];
}

interface InformationAction {
  label: string;
  href: string;
  primary?: boolean;
}

interface InformationPageProps {
  eyebrow: string;
  title: string;
  description: string;
  sections: InformationSection[];
  actions?: InformationAction[];
  notice?: string;
}

export function InformationPage({ eyebrow, title, description, sections, actions = [], notice }: InformationPageProps) {
  return (
    <main className="informationPage">
      <section className="shell pageIntro informationIntro">
        <div className="informationIntroCopy">
          <span className="eyebrow dark">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          {actions.length > 0 ? (
            <div className="informationActions">
              {actions.map((action) => (
                <a className={action.primary ? "btn btnPrimary" : "btn btnGhost dark"} href={action.href} key={`${action.href}-${action.label}`}>
                  <span>{action.label}</span>
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="informationBand">
        <div className="shell informationGrid">
          {sections.map((section) => (
            <article className="informationSection" key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
              {section.bullets?.length ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {notice ? (
        <section className="shell informationNotice" role="note">
          {notice}
        </section>
      ) : null}
    </main>
  );
}
