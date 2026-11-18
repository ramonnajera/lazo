// @ts-expect-error sin @types/node: solo se lee el CSS como texto
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/ui/tokens.css", "utf8");

// jsdom no calcula hojas de estilo importadas: se comprueba el texto del CSS.

describe("tokens.css banner-aware caps", () => {
  it("banner_sets_avail_and_caps_read_it_locally", () => {
    expect(css).toMatch(/\.isl\[data-banner\]\s*\{\s*--avail:\s*calc\(360px - var\(--bar-h\) - 64px\)/);
    expect(css).toMatch(/\.chat-msgs\s*\{[^}]*max-height:\s*min\(240px, calc\(var\(--avail\) - 64px\)\)/);
    expect(css).toMatch(/\.pf\s*\{[^}]*max-height:\s*var\(--avail\)/);
    expect(css).toMatch(/\.fm\s*\{[^}]*max-height:\s*var\(--avail\)/);
    expect(css).toMatch(/\.list-scroll\s*\{[^}]*max-height:\s*min\(var\(--list-max\), calc\(var\(--avail\) - 110px\)\)/);
    // --avail no se deriva en :root hacia otra variable (se calcularía sin el aviso).
    expect(css).not.toMatch(/--history-max/);
  });

  it("no_uncapped_scroll_inside_pf_list", () => {
    const pfList = css.match(/\.pf-list\s*\{[^}]*\}/)![0];
    expect(pfList).toMatch(/overflow-y:\s*visible/); // .pf-list no desplaza: lo hace .list-scroll
    expect(css).not.toMatch(/overflow-y:\s*auto[^}]*\}[^]*\.pf-list[^{]*\{[^}]*overflow-y:\s*auto/);
  });
});

describe("tokens.css row actions", () => {
  it("row_failure_keeps_actions_visible_without_hover", () => {
    expect(css).toMatch(/\.crow \.acts:has\(\.act-fail\)[^{]*\{[^}]*opacity: 1; pointer-events: auto/);
  });

  it("paused_music_dot_is_grey", () => {
    expect(css).toMatch(/\.bar-dot\.paused\s*\{[^}]*background: var\(--text-3\)/);
  });
});

describe("tokens.css primary buttons", () => {
  it("bare_pri_class_does_not_size_primary_buttons", () => {
    // `.pri` es el modificador de .fm-b/.al-b: una regla `.pri { width… }` encogía «Guardar» a 24×14 px.
    expect(css).not.toMatch(/(^|[\s,}])\.pri\s*[{,]/m);
    expect(css).toMatch(/\.pri-dot\s*\{[^}]*width:\s*3px/);
  });

  it("footer_buttons_never_shrink_or_wrap", () => {
    for (const sel of ["fm-b", "al-b"]) {
      const rule = css.match(new RegExp(`\\.${sel}\\s*\\{[^}]*\\}`))![0];
      expect(rule).toMatch(/flex:\s*none/);
      expect(rule).toMatch(/white-space:\s*nowrap/);
    }
  });
  it("outer_panel_scroll_never_shows_a_second_scrollbar", () => {
    expect(css).toMatch(/\.pf\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/\.isl \*\s*\{[^}]*scrollbar-width:\s*thin/);
  });
});

describe("tokens.css estilo de la app (2026-10-28)", () => {
  it("island_background_is_pure_black", () => {
    expect(css).toMatch(/--bg:\s*#000;/);
  });

  it("count_pill_is_white_with_black_text", () => {
    expect(css).toMatch(/--count-bg:\s*#fff;/);
    expect(css).toMatch(/--count-fg:\s*#000;/);
  });

  it("font_is_inter_with_segoe_fallback", () => {
    expect(css).toMatch(/--font:\s*"Inter",[^;]*"Segoe UI"/);
  });

  it("list_tiles_have_round_icon_and_group_titles", () => {
    expect(css).toMatch(/\.tile-ic\s*\{[^}]*border-radius:\s*50%/);
    expect(css).toMatch(/\.tiles-title\s*\{/);
  });
});

describe("tokens.css bar keeps one size", () => {
  const rule = (sel: RegExp) => (css.match(sel) ?? [""])[0];
  it("bar_view_has_the_same_width_as_the_open_card", () => {
    // La barra mide lo mismo sola que con una sección abierta: nada de `width: auto` en la vista "bar".
    expect(css).not.toMatch(/\.isl\[data-view="bar"\]\s*\{[^}]*width:\s*auto/);
    expect(rule(/\.isl\s*\{[^}]*\}/)).toMatch(/width:\s*var\(--island-w\)/);
  });
  it("hidden_measuring_bar_has_the_shown_width_so_the_strip_matches_it", () => {
    expect(rule(/\.isl \.bar\[aria-hidden="true"\]\s*\{[^}]*\}/)).toMatch(/width:\s*var\(--island-w\)/);
  });
  it("count_and_next_event_sit_at_the_right_edge", () => {
    expect(rule(/\.bar-tail\s*\{[^}]*\}/)).toMatch(/margin-left:\s*auto/);
  });
  it("bar_pills_do_not_overlap_their_neighbours", () => {
    // Un margen negativo mayor que el relleno del botón encimaba el óvalo sobre el puntito de música.
    const m = /\.bar-time\s*\{[^}]*padding:\s*\d+px (\d+)px;[^}]*margin:\s*0 -(\d+)px/.exec(css)!;
    expect(Number(m[2])).toBeLessThanOrEqual(Number(m[1]));
  });
});

describe("index.css settings window scrollbars", () => {
  const index = readFileSync("src/index.css", "utf8");

  it("native_controls_follow_the_theme_outside_the_island", () => {
    // Sin color-scheme, Windows dibuja barras blancas sobre el tema oscuro.
    expect(index).toMatch(/html:not\(\.island\)\s*\{[^}]*color-scheme:\s*light/);
    expect(index).toMatch(/html\.dark:not\(\.island\)\s*\{[^}]*color-scheme:\s*dark/);
  });

  it("scrollbars_are_thin_on_every_scroller_of_the_settings_window", () => {
    // scrollbar-width no se hereda: tiene que aplicarse a cada elemento.
    expect(index).toMatch(/html:not\(\.island\) \*\s*\{[^}]*scrollbar-width:\s*thin/);
  });
});
