"""Собирает итоговый каталог из черновика, сопоставлений и новостей.

python3 scripts/build_catalog.py input/Каталог_2019_май_черновик.xlsx data/matches_2019_05.json \
    data/news.json data/events_2019.json output/Каталог_2019_май.xlsx
"""
import json
import sys
from datetime import datetime

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

draft_path, matches_path, news_path, events_path, out_path = sys.argv[1:6]
draft = load_workbook(draft_path).active
matches = {m["id"]: m for m in json.load(open(matches_path, encoding="utf-8"))}
news = {a["url"]: a for a in json.load(open(news_path, encoding="utf-8"))}
events = json.load(open(events_path, encoding="utf-8"))

NU_DIPLOMY = "https://nazarbayev.kz/ru/news/2019-05/pervyy-prezident-kazakhstana-vruchil-diplomy-s-otlichiem-vypusknikam-nazarbaev"
NU_ATLET = "https://nazarbayev.kz/ru/news/2019-05/elbasy-prinyal-uchastie-v-ceremonii-otkrytiya-novogo-atleticheskogo-centra-nazarbaev"

# Файлы не по теме каталога (без участия Н.А.Назарбаева) — в каталог не попадают.
EXCLUDE = [
    "PRK i D.Tusk",  # встреча Президента РК К.-Ж.Токаева с Д.Туском
]

# Ручные уточнения по результатам проверки новостей: (подстрока ID) -> (доп. ссылки, текст «Проверить», замена описания)
NOTES = [
    ("Karibaev", None, "На сайте: академик Серик КИРАБАЕВ (в имени файла — Karibaev/Karibaeva).", None),
    ("Usmanov", None, "Новости о встрече с А.Усмановым на сайте нет (за 09–13.05.2019 проверено). Дату и событие уточнить.", None),
    ("17.05.2019_AEF", None, "Второй день АЭФ (17.05), Елбасы в кадре нет; ссылка — на новость об АЭФ 16.05.", "XII Астанинский экономический форум, второй день. Без участия Елбасы. Конгресс-центр."),
    ("Foto Elbasy i PRK", None, "", "XII Астанинский экономический форум. Церемония фотографирования Первого Президента РК – Елбасы Н.А.Назарбаева и Президента РК К.-Ж.Токаева."),
    ("Sarkisyan", None, "На сайте: Председатель Коллегии ЕЭК Тигран САРКИСЯН (не Президент Армении А.Саркисян).", None),
    ("Chigeo Katsy", None, "Правильно: Шигео Катсу (Shigeo Katsu), президент Назарбаев Университета.", None),
    ("Saparbaeva", None, "Правильно: Бердибек Сапарбаев.", None),
    ("21.06.19 Almaty", None, "Дата 21.06.2019 подтверждена: на сайте в этот день конференция «30 лет лидерства».", None),
    ("vruch diplomov NU. Otkr", [NU_DIPLOMY, NU_ATLET], "В файле два события: вручение дипломов и открытие Атлетического центра.",
     "Вручение дипломов выпускникам Назарбаев Университета и открытие нового Атлетического центра НУ с участием Первого Президента РК – Елбасы Н.А.Назарбаева."),
]


def describe(event_text, kind, operator):
    parts = [event_text.rstrip(".") + "."]
    if kind and not ("фотограф" in kind.lower() and "фотограф" in event_text.lower()):  # не повторять тип, если он уже в описании
        parts.append(kind[0].upper() + kind[1:].rstrip(".") + ".")
    if operator:
        parts.append(f"Оператор: {operator.rstrip('.')}.")
    return " ".join(parts)


rows = []
for r in draft.iter_rows(min_row=2, values_only=True):
    fid, date, draft_descr, kind, operator, check = (list(r) + [None] * 8)[:6]
    if not fid or any(key in fid for key in EXCLUDE):
        continue
    m = matches.get(fid, {})
    urls = [m["url"]] if m.get("url") else []
    notes = []  # заметки черновика заменены результатами проверки по сайту (NOTES)
    text_override = None
    for key, extra_urls, note, override in NOTES:
        if key in fid:
            if extra_urls:
                urls = extra_urls
            notes.append(note)
            text_override = override or text_override
    event = text_override or (events.get(urls[0]) if urls else None)
    descr = describe(event, kind, operator) if event else draft_descr
    conf = m.get("conf", "")
    if not urls:
        conf = "не найдено"
    rows.append({
        "id": fid, "date": date, "descr": descr, "kind": kind, "operator": operator,
        "check": " ".join(n for n in notes if n), "urls": urls, "conf": conf,
        "title": " | ".join(news[u]["title"] for u in urls if u in news),
        "text": "\n\n".join(news[u]["text"] for u in urls if u in news),
    })

wb = Workbook()
HEAD = Font(bold=True)
FILL = PatternFill("solid", fgColor="FFF2CC")
WRAP = Alignment(wrap_text=True, vertical="top")

# Лист 1 — в формате основного каталога: ID | Дата | Описание
ws = wb.active
ws.title = "2019"
ws.append(["ID", "Дата", "Описание"])
for r in rows:
    ws.append([r["id"], r["date"], r["descr"]])
for c, w in zip("ABC", (62, 12, 110)):
    ws.column_dimensions[c].width = w

# Лист 2 — подробно, для проверки
ws2 = wb.create_sheet("Подробно")
ws2.append(["ID (имя файла в Avid)", "Дата", "Описание", "Тип материала", "Оператор / камера",
            "Проверить", "Ссылка на новость nazarbayev.kz", "Заголовок новости", "Текст новости", "Уверенность сопоставления"])
for r in rows:
    ws2.append([r["id"], r["date"], r["descr"], r["kind"], r["operator"], r["check"],
                "\n".join(r["urls"]), r["title"], r["text"], r["conf"]])
    if r["check"] or not r["urls"]:
        for cell in ws2[ws2.max_row]:
            cell.fill = FILL
for c, w in zip("ABCDEFGHIJ", (55, 12, 70, 18, 16, 45, 45, 50, 80, 16)):
    ws2.column_dimensions[c].width = w

# Лист 3 — все собранные новости за период
ws3 = wb.create_sheet("Новости сайта")
ws3.append(["Дата", "Рубрика", "Заголовок", "Ссылка", "Текст"])
for a in news.values():
    ws3.append([datetime.strptime(a["date"], "%d.%m.%Y") if a["date"] else None, a["rubric"], a["title"], a["url"], a["text"]])
for c, w in zip("ABCDE", (12, 14, 70, 50, 100)):
    ws3.column_dimensions[c].width = w

for sh in (ws, ws2, ws3):
    sh.freeze_panes = "A2"
    for cell in sh[1]:
        cell.font = HEAD
    for row in sh.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = WRAP
            if isinstance(cell.value, datetime):
                cell.number_format = "DD.MM.YYYY"

wb.save(out_path)
found = sum(1 for r in rows if r["urls"])
print(f"Исключено (не Назарбаев): {len(EXCLUDE)}. Файлов: {len(rows)}, со ссылкой на новость: {found}, на проверку: {sum(1 for r in rows if r['check'])}")
