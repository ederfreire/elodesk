// Local shim replacing the unmaintained `html2pdf.js` package.
// Implements the small subset used across the app:
//   html2pdf().from(el).set(opts).save()
//   html2pdf().from(el).set(opts).output("blob")
// Uses html2canvas + jspdf directly (both are already project deps and are
// on patched versions).

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

class Html2Pdf {
  constructor() {
    this.opts = {
      margin: 0,
      filename: "document.pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    this.source = null;
  }

  from(el) {
    this.source = el;
    return this;
  }

  set(opts = {}) {
    this.opts = {
      ...this.opts,
      ...opts,
      image: { ...this.opts.image, ...(opts.image || {}) },
      html2canvas: { ...this.opts.html2canvas, ...(opts.html2canvas || {}) },
      jsPDF: { ...this.opts.jsPDF, ...(opts.jsPDF || {}) },
    };
    return this;
  }

  async _render() {
    const source = this.source;
    if (!source) throw new Error("html2pdf: no source element");

    // If element is detached, temporarily attach off-screen so it can render.
    const attached = document.body.contains(source);
    let holder = null;
    if (!attached) {
      holder = document.createElement("div");
      holder.style.position = "fixed";
      holder.style.left = "-10000px";
      holder.style.top = "0";
      holder.appendChild(source);
      document.body.appendChild(holder);
    }

    try {
      const canvas = await html2canvas(source, this.opts.html2canvas);
      const imgType = (this.opts.image && this.opts.image.type) || "jpeg";
      const imgQuality = (this.opts.image && this.opts.image.quality) || 0.95;
      const imgData = canvas.toDataURL(`image/${imgType}`, imgQuality);

      const pdf = new jsPDF(this.opts.jsPDF);

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = Number(this.opts.margin) || 0;
      const usableW = pageWidth - margin * 2;
      const usableH = pageHeight - margin * 2;

      // Fit image to width, paginate vertically.
      const imgW = usableW;
      const imgH = (canvas.height * imgW) / canvas.width;

      if (imgH <= usableH) {
        pdf.addImage(imgData, imgType.toUpperCase(), margin, margin, imgW, imgH);
      } else {
        // Slice canvas into page-sized chunks.
        const pxPerMm = canvas.width / imgW;
        const pageHeightPx = Math.floor(usableH * pxPerMm);
        let renderedPx = 0;
        while (renderedPx < canvas.height) {
          const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeightPx;
          const ctx = sliceCanvas.getContext("2d");
          ctx.drawImage(
            canvas,
            0,
            renderedPx,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );
          const sliceData = sliceCanvas.toDataURL(`image/${imgType}`, imgQuality);
          const sliceHmm = sliceHeightPx / pxPerMm;
          pdf.addImage(sliceData, imgType.toUpperCase(), margin, margin, imgW, sliceHmm);
          renderedPx += sliceHeightPx;
          if (renderedPx < canvas.height) pdf.addPage();
        }
      }

      return pdf;
    } finally {
      if (holder && holder.parentNode) holder.parentNode.removeChild(holder);
    }
  }

  async save() {
    const pdf = await this._render();
    pdf.save(this.opts.filename);
    return this;
  }

  async output(type = "blob") {
    const pdf = await this._render();
    return pdf.output(type);
  }
}

export default function html2pdf() {
  return new Html2Pdf();
}
