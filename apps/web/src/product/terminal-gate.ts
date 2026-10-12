/** The Mac-style terminal window used by the access screens. */


/** Mac-style terminal window frame shared by the homepage and access. */
export function terminalWindow(title: string, body: string, className = ""): string {
  return `<section class="hidn-term ${className}">
    <div class="hidn-term__bar" aria-hidden="true"><i></i><i></i><i></i><span>${title}</span></div>
    <div class="hidn-term__body">${body}</div>
  </section>`;
}
