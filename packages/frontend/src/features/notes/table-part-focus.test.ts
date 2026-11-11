import { describe, expect, it } from "vitest";
import { tablePartElements } from "./table-part-focus";

function table(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<table><tbody>
    <tr><th>A</th><th>B</th><th>C</th></tr>
    <tr><td>1</td><td>2</td><td>3</td></tr>
    <tr><td>4</td><td>5</td><td>6</td></tr>
  </tbody></table>`;
  return wrapper;
}
const texts = (elements: HTMLElement[]) => elements.map((e) => e.textContent);

describe("tablePartElements", () => {
  it("returns the cells of a row, counting from 1", () => {
    expect(texts(tablePartElements(table(), { row: 2 }))).toEqual(["1", "2", "3"]);
    expect(texts(tablePartElements(table(), { row: 1 }))).toEqual(["A", "B", "C"]);
  });

  it("returns the cells of a column, one per row", () => {
    expect(texts(tablePartElements(table(), { column: 2 }))).toEqual(["B", "2", "5"]);
  });

  it("returns nothing for a row or column that is not there", () => {
    expect(tablePartElements(table(), { row: 9 })).toEqual([]);
    expect(tablePartElements(table(), { column: 9 })).toEqual([]);
    expect(tablePartElements(table(), {})).toEqual([]);
    expect(tablePartElements(document.createElement("div"), { row: 1 })).toEqual([]);
  });
});
