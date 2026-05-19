/**
 * ATS-friendly CV PDF generator.
 *
 * Design goals:
 *  - Real selectable text (no images/raster) so ATS parsers can read it.
 *  - Single-column layout, standard section names (Summary, Experience,
 *    Skills, Education, Certifications, Languages).
 *  - Standard PDF font (Helvetica) which is one of the 14 built-in fonts
 *    every PDF reader and parser supports.
 *  - Visual style mirrors the reference image: blue section headings with
 *    a horizontal rule beneath, bold sub-headers, bulleted body text.
 */

const PDFDocument = require('pdfkit');

const COLORS = {
  primary: '#1a4d8f', // blue used for name + section headers
  text: '#000000',
  muted: '#333333',
  rule: '#1a4d8f',
};

const FONTS = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};

/**
 * Render a CV as a PDF and pipe the bytes to `outStream`.
 *
 * @param {object} data  CV data (see README / sample below).
 * @param {Writable} outStream  Any writable stream (e.g. an Express res).
 */
function generateCV(data, outStream) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: `${data.name || 'CV'} - Resume`,
      Author: data.name || '',
      Subject: data.headline || 'Curriculum Vitae',
    },
  });

  doc.pipe(outStream);

  renderHeader(doc, data);
  renderSummary(doc, data);
  renderExperience(doc, data);
  renderSkills(doc, data);
  renderEducation(doc, data);
  renderCertifications(doc, data);
  renderLanguages(doc, data);

  doc.end();
}

/* --------------------------------- helpers -------------------------------- */

function sectionHeading(doc, title) {
  // Add some breathing room above each section.
  if (doc.y > doc.page.margins.top) {
    doc.moveDown(0.6);
  }

  doc
    .font(FONTS.bold)
    .fontSize(14)
    .fillColor(COLORS.primary)
    .text(title, { lineGap: 2 });

  // Horizontal rule under the heading.
  const y = doc.y + 1;
  doc
    .strokeColor(COLORS.rule)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke();

  doc.moveDown(0.5);
  doc.fillColor(COLORS.text);
}

function bulletLine(doc, text) {
  const indent = 14;
  const left = doc.page.margins.left;
  const width =
    doc.page.width - doc.page.margins.left - doc.page.margins.right - indent;

  const startY = doc.y;
  doc
    .font(FONTS.regular)
    .fontSize(10.5)
    .fillColor(COLORS.text)
    .text('\u2022', left, startY, { width: indent, continued: false });

  doc.text(text, left + indent, startY, {
    width,
    align: 'left',
    lineGap: 1.5,
  });
}

function paragraph(doc, text) {
  doc
    .font(FONTS.regular)
    .fontSize(10.5)
    .fillColor(COLORS.text)
    .text(text, {
      align: 'left',
      lineGap: 1.5,
    });
}

function boldLine(doc, text, size = 11) {
  doc
    .font(FONTS.bold)
    .fontSize(size)
    .fillColor(COLORS.text)
    .text(text, { lineGap: 1.5 });
}

/* -------------------------------- sections -------------------------------- */

function renderHeader(doc, data) {
  // Name
  doc
    .font(FONTS.bold)
    .fontSize(26)
    .fillColor(COLORS.primary)
    .text(data.name || '', { lineGap: 2 });

  // Headline | Location | Phone
  const line1Parts = [data.headline, data.location, data.phone].filter(Boolean);
  if (line1Parts.length) {
    doc
      .font(FONTS.regular)
      .fontSize(10.5)
      .fillColor(COLORS.muted)
      .text(line1Parts.join('  |  '), { lineGap: 1.5 });
  }

  // Email (own line, like the reference)
  if (data.email) {
    doc
      .font(FONTS.regular)
      .fontSize(10.5)
      .fillColor(COLORS.muted)
      .text(data.email, { lineGap: 1.5 });
  }

  // Optional extras (LinkedIn, website) on the same email-style line.
  const extras = [data.linkedin, data.website].filter(Boolean);
  if (extras.length) {
    doc
      .font(FONTS.regular)
      .fontSize(10.5)
      .fillColor(COLORS.muted)
      .text(extras.join('  |  '), { lineGap: 1.5 });
  }

  doc.moveDown(0.4);
  doc.fillColor(COLORS.text);
}

function renderSummary(doc, data) {
  if (!data.summary) return;
  sectionHeading(doc, 'Summary');
  paragraph(doc, data.summary);
}

function renderExperience(doc, data) {
  if (!Array.isArray(data.experience) || data.experience.length === 0) return;
  sectionHeading(doc, 'Experience');

  data.experience.forEach((job, idx) => {
    if (idx > 0) doc.moveDown(0.5);

    if (job.company) boldLine(doc, job.company, 11);

    const titleLine = [job.title, job.period].filter(Boolean).join('  |  ');
    if (titleLine) boldLine(doc, titleLine, 11);

    if (Array.isArray(job.bullets)) {
      job.bullets.forEach((b) => bulletLine(doc, b));
    }
  });
}

function renderSkills(doc, data) {
  if (!Array.isArray(data.skills) || data.skills.length === 0) return;
  sectionHeading(doc, 'Skills');

  // Render skills as a comma-separated paragraph (ATS-friendly: keywords
  // remain easy to extract while staying compact).
  const formatted = data.skills
    .map((s) => {
      if (typeof s === 'string') return s;
      if (s && s.name) {
        return s.level ? `${s.name} (${s.level})` : s.name;
      }
      return '';
    })
    .filter(Boolean)
    .join(', ');

  paragraph(doc, formatted + '.');
}

function renderEducation(doc, data) {
  if (!Array.isArray(data.education) || data.education.length === 0) return;
  sectionHeading(doc, 'Education');

  data.education.forEach((edu, idx) => {
    if (idx > 0) doc.moveDown(0.5);
    if (edu.school) boldLine(doc, edu.school, 11);
    if (edu.degree) boldLine(doc, edu.degree, 11);
    if (edu.period) {
      doc
        .font(FONTS.regular)
        .fontSize(10.5)
        .fillColor(COLORS.text)
        .text(edu.period, { lineGap: 1.5 });
    }
    if (Array.isArray(edu.bullets)) {
      edu.bullets.forEach((b) => bulletLine(doc, b));
    } else if (edu.gpa) {
      bulletLine(doc, `GPA: ${edu.gpa}`);
    }
  });
}

function renderCertifications(doc, data) {
  if (!Array.isArray(data.certifications) || data.certifications.length === 0)
    return;
  sectionHeading(doc, 'Certifications');

  data.certifications.forEach((cert, idx) => {
    if (idx > 0) doc.moveDown(0.5);
    if (cert.name) boldLine(doc, cert.name, 11);
    const meta = [cert.issuer, cert.date].filter(Boolean).join('  |  ');
    if (meta) {
      doc
        .font(FONTS.regular)
        .fontSize(10.5)
        .fillColor(COLORS.text)
        .text(meta, { lineGap: 1.5 });
    }
    if (Array.isArray(cert.bullets)) {
      cert.bullets.forEach((b) => bulletLine(doc, b));
    }
  });
}

function renderLanguages(doc, data) {
  if (!Array.isArray(data.languages) || data.languages.length === 0) return;
  sectionHeading(doc, 'Languages');

  const formatted = data.languages
    .map((l) => {
      if (typeof l === 'string') return l;
      if (l && l.name) {
        return l.level ? `${l.name} (${l.level})` : l.name;
      }
      return '';
    })
    .filter(Boolean)
    .join(', ');

  paragraph(doc, formatted);
}

/* ----------------------------- sample dataset ----------------------------- */
// Mirrors the reference image so `GET /generate-cv` produces the example CV
// out-of-the-box without any input.
const SAMPLE_CV = {
  name: 'Hanna Fransiska',
  headline: 'Head of Investment Operations & Customer Service',
  location: 'Tangerang, Banten',
  phone: '0812 8094 4114',
  email: 'hannafransiskaa@gmail.com',
  summary:
    "Senior investment operations professional with 13+ years of proven success in Indonesia's asset management industry. Currently serving as Head of Investment Operations & Customer Service at Principal Asset Management, with deep expertise in end-to-end investment operations, fund accounting, regulatory reporting, mutual fund taxation, and customer service management.",
  experience: [
    {
      company: 'Principal Asset Management',
      title: 'Head of Investment Operations & Customer Service',
      period: 'August 2022 \u2013 Present',
      bullets: [
        'Lead and manage end-to-end investment operations and customer service.',
        'Handle offshore investment products and customer complaint resolution.',
      ],
    },
    {
      company: 'PT Batavia Prosperindo Aset Manajemen',
      title: 'Operational Fund Accounting',
      period: '2013 \u2013 2022',
      bullets: [
        'Managed NAV, reconciliation, fund setup, and operational reporting.',
        'Coordinated with KSEI and Custodian Banks.',
      ],
    },
  ],
  skills: [
    { name: 'Investment Operations Management', level: 'Beginner' },
    { name: 'Fund Accounting & Reconciliation', level: 'Beginner' },
    { name: 'Mutual Fund Operations', level: 'Beginner' },
    { name: 'Customer Service Leadership', level: 'Beginner' },
    { name: 'Regulatory Reporting & Compliance', level: 'Beginner' },
    { name: 'Stakeholder & Client Management', level: 'Beginner' },
  ],
  education: [
    {
      school: 'Trisakti School of Management',
      degree: 'Bachelor of Business / Accounting',
      gpa: '2.9 / 4.0',
    },
  ],
  certifications: [
    {
      name: 'Wakil Manajer Investasi (WMI) License',
      bullets: ['Issued by Otoritas Jasa Keuangan (OJK)'],
    },
  ],
  languages: ['English'],
};

module.exports = { generateCV, SAMPLE_CV };
