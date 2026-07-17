import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";

const root = document.getElementById("app");
const app = new App({ name: "ametller-purchase-insights", version: "0.5.3" });
const euros = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" });

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (value != null) node.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) if (child) node.append(child);
  return node;
}

function applyHostContext(context = {}) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

function stat(label, value) {
  return element("div", { className: "stat" }, [
    element("span", { className: "muted", text: label }),
    element("strong", { text: value }),
  ]);
}

function bars(title, rows, labelKey) {
  const section = element("section", { className: "section" }, element("h3", { text: title }));
  const chart = element("div", { className: "bars", role: "img", "aria-label": `${title} bar chart` });
  const max = Math.max(1, ...rows.map((row) => Number(row.spend) || 0));
  for (const row of rows.slice(-8)) {
    chart.append(element("div", { className: "bar-row" }, [
      element("span", { text: row[labelKey] }),
      element("div", { className: "bar-track", "aria-hidden": "true" },
        element("div", { className: "bar", style: `width:${Math.max(2, (row.spend / max) * 100)}%` })),
      element("span", { text: euros.format(row.spend) }),
    ]));
  }
  section.append(chart);
  return section;
}

function topProducts(products) {
  const section = element("section", { className: "section" }, element("h3", { text: "Most frequent products" }));
  const list = element("div", { className: "products" });
  for (const product of products.slice(0, 8)) {
    list.append(element("div", { className: "product-row" }, [
      element("span", { text: product.name }),
      element("span", { className: "muted", text: `${product.purchase_count} shops` }),
      element("span", { text: euros.format(product.spend) }),
    ]));
  }
  section.append(list);
  return section;
}

function suggestionList(suggestions) {
  const section = element("section", { className: "section" }, [
    element("h3", { text: "Smart basket suggestions" }),
    element("p", { className: "muted", text: "Choose products, then approve the real basket change." }),
  ]);
  const list = element("div", { className: "suggestions" });
  const selected = new Map();
  const button = element("button", {
    className: "primary",
    type: "button",
    disabled: "",
    text: "Add selected to real basket",
  });
  const status = element("span", { className: "status", role: "status" });

  function updateButton() {
    const count = selected.size;
    button.disabled = count === 0;
    button.textContent = count ? `Add ${count} selected to real basket` : "Add selected to real basket";
  }

  for (const [index, suggestion] of suggestions.entries()) {
    const input = element("input", {
      type: "checkbox",
      id: `suggestion-${index}`,
      ...(suggestion.selectable ? {} : { disabled: "" }),
      "aria-label": `Select ${suggestion.name}`,
    });
    input.addEventListener("change", () => {
      if (input.checked) selected.set(suggestion.product_id, suggestion);
      else selected.delete(suggestion.product_id);
      updateButton();
    });
    const image = suggestion.image
      ? element("img", { src: suggestion.image, alt: "", loading: "lazy" })
      : element("span", { "aria-hidden": "true" });
    const details = element("div", { className: "suggestion-name" }, [
      element("label", { for: `suggestion-${index}` }, element("strong", { text: suggestion.name })),
      element("span", {
        className: "muted",
        text: suggestion.selectable
          ? `${suggestion.purchase_count} purchase day${suggestion.purchase_count === 1 ? "" : "s"} · last ${suggestion.days_since}d ago${suggestion.typical_gap_days ? ` · typical gap ${suggestion.typical_gap_days}d` : ""}`
          : "No safe current catalog match",
      }),
    ]);
    if (suggestion.url) details.append(element("button", {
      className: "link",
      type: "button",
      text: "View product",
      onclick: () => app.openLink({ url: suggestion.url }),
    }));
    list.append(element("div", { className: "suggestion" }, [
      input,
      image,
      details,
      element("span", {
        className: "suggestion-price",
        text: suggestion.price ? `${suggestion.quantity} × ${euros.format(suggestion.price)}` : `× ${suggestion.quantity}`,
      }),
    ]));
  }

  button.addEventListener("click", async () => {
    const items = [...selected.values()];
    if (!items.length) return;
    button.disabled = true;
    status.dataset.kind = "";
    status.textContent = "Adding approved products…";
    let added = 0;
    try {
      for (const item of items) {
        const result = await app.callServerTool({
          name: "ametller_add_to_cart",
          arguments: { product_id: String(item.product_id), quantity: item.quantity },
        });
        if (result.isError) throw new Error("Cart update failed");
        added += 1;
      }
      status.dataset.kind = "success";
      status.textContent = `${added} product${added === 1 ? "" : "s"} added. Review the basket before paying on Ametller.`;
      for (const input of list.querySelectorAll("input:checked")) input.checked = false;
      selected.clear();
    } catch {
      status.dataset.kind = "error";
      status.textContent = `${added} added before a failure. Ask Claude to show the current basket before retrying.`;
    }
    updateButton();
  });

  section.append(list, element("div", { className: "actions" }, [button, status]));
  return section;
}

function render(data) {
  root.replaceChildren();
  const summary = data?.summary;
  if (!summary) {
    root.append(element("p", { className: "empty", text: "No purchase insights are available yet." }));
    return;
  }
  root.append(
    element("section", { className: "section" }, [
      element("h2", { text: "Your Ametller purchase pattern" }),
      element("div", { className: "stats" }, [
        stat("Spend", euros.format(summary.spend)),
        stat("Shops", String(summary.purchases)),
        stat("Average basket", euros.format(summary.average_basket)),
      ]),
    ]),
  );
  if (data.prediction?.model) root.append(element("p", {
    className: "muted",
    text: data.prediction.model === "multi-scale-recency-30"
      ? `Repeat suggestions use recency across ${data.prediction.purchase_days} purchase days; catalog discovery handles new products separately.`
      : `Experimental protein rotation across ${data.prediction.purchase_days} purchase days; exact-product accuracy is slightly lower than repeat mode.`,
  }));
  if (data.monthly?.length) root.append(bars("Spend by month", data.monthly, "month"));
  if (data.categories?.length) root.append(bars("Spend by category", data.categories.slice(0, 8), "category"));
  if (data.top_products?.length) root.append(topProducts(data.top_products));
  if (data.suggestions?.length) root.append(suggestionList(data.suggestions));
  else root.append(element("p", { className: "empty", text: "Nothing is due enough to suggest right now." }));
}

app.addEventListener("toolresult", (result) => render(result.structuredContent));
app.addEventListener("hostcontextchanged", applyHostContext);
app.connect()
  .then(() => applyHostContext(app.getHostContext()))
  .catch(() => root.replaceChildren(element("p", {
    className: "empty",
    text: "The interactive view could not connect. Ask Claude for the text version of purchase insights.",
  })));
