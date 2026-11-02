// Run with: node --test lib/comic-name.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"
import { formatFolderTitle, parseComicName } from "./comic-name.ts"

test("parses volume, bracket tags and format", () => {
  assert.deepEqual(parseComicName("Fire Punch v01 (2018) (Digital) (Shizu).cbz"), {
    title: "Fire Punch v01",
    number: "01",
    metadata: "2018 · Digital · Shizu · CBZ",
    format: "CBZ",
  })
})

test("parses names from the real catalog", () => {
  assert.deepEqual(parseComicName("Solo Leveling 183 - SE04 (2023) (Digital) (4str0).cbz"), {
    title: "Solo Leveling 183 - SE04",
    number: "183",
    metadata: "2023 · Digital · 4str0 · CBZ",
    format: "CBZ",
  })
  assert.deepEqual(parseComicName("Oyasumi Punpun Vol. 01 - Asano Inio.cbz"), {
    title: "Oyasumi Punpun Vol. 01 - Asano Inio",
    number: "01",
    metadata: "CBZ",
    format: "CBZ",
  })
})

test("reads square and curly brackets", () => {
  const parsed = parseComicName("[Group] Heavenly Delusion 044 {2021}.cbr")
  assert.equal(parsed.title, "Heavenly Delusion 044")
  assert.equal(parsed.number, "044")
  assert.equal(parsed.metadata, "Group · 2021 · CBR")
})

test("recognises number styles", () => {
  const numberOf = (name) => parseComicName(name).number
  assert.equal(numberOf("Title Chapter 12.cbz"), "12")
  assert.equal(numberOf("Title ch.12.5.cbz"), "12.5")
  assert.equal(numberOf("Title v02c013.cbz"), "02")
  assert.equal(numberOf("Title c013.cbz"), "013")
  assert.equal(numberOf("Title #7.cbz"), "7")
  assert.equal(numberOf("Title - 05.cbz"), "05")
  assert.equal(numberOf("044.cbz"), "044")
})

test("does not mistake words, leading numbers or years for an issue number", () => {
  const numberOf = (name) => parseComicName(name).number
  assert.equal(numberOf("Some Title.cbz"), null)
  assert.equal(numberOf("100 Bullets.cbz"), null)
  assert.equal(numberOf("100 Bullets 12.cbz"), "12")
  assert.equal(numberOf("Akira 1988.cbz"), null)
  assert.equal(numberOf("20th Century Boys.cbz"), null)
  assert.equal(numberOf("Vivid Dreams.cbz"), null)
})

test("normalises underscore and dot separators", () => {
  assert.equal(parseComicName("fire_punch_v01.cbz").title, "fire punch v01")
  assert.equal(parseComicName("Fire.Punch.v1.5.cbz").title, "Fire Punch v1.5")
  assert.equal(parseComicName("Fire.Punch.v1.5.cbz").number, "1.5")
})

test("only strips known or supplied extensions", () => {
  assert.equal(parseComicName("Dr.Stone").format, null)
  assert.equal(parseComicName("Dr. Stone 3").title, "Dr. Stone 3")
  assert.equal(parseComicName("Comic 3.webarc", "webarc").title, "Comic 3")
  assert.equal(parseComicName("Comic 3", "cbz").format, "CBZ")
})

test("falls back to the raw name instead of an empty title", () => {
  assert.equal(parseComicName("(2018) (Digital).cbz").title, "(2018) (Digital)")
  assert.equal(parseComicName("(2018) (Digital).cbz").number, null)
  assert.equal(parseComicName(".cbz").title, ".cbz")
  assert.deepEqual(parseComicName(""), { title: "", number: null, metadata: "", format: null })
  assert.equal(parseComicName(undefined).title, "")
  assert.equal(parseComicName("Broken (name [x.cbz").title, "Broken (name [x")
})

test("formats folder titles", () => {
  assert.equal(formatFolderTitle("fire_punch"), "Fire Punch")
  assert.equal(formatFolderTitle("punpun"), "Punpun")
  assert.equal(formatFolderTitle("Solo Leveling"), "Solo Leveling")
  assert.equal(formatFolderTitle("___"), "___")
})
