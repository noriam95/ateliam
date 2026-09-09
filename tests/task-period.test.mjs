import {test} from "node:test";
import assert from "node:assert/strict";
import {periodRange,periodColumns,shiftPeriod,validDay} from "../src/lib/task-period.ts";
test("calendar periods respect leap years and week/year boundaries",()=>{
 assert.equal(periodRange("2024-06-15","year").days.length,366);
 assert.equal(periodRange("2026-06-15","year").days.length,365);
 assert.deepEqual(periodRange("2026-09-09","day").days,["2026-09-09"]);
 const week=periodRange("2026-01-01","week");assert.equal(week.from,"2025-12-28");assert.equal(week.until,"2026-01-03");assert.equal(week.days.length,7);
 assert.equal(periodRange("2026-09-09","month").days.length,42);
 assert.equal(periodColumns("2026-09-09","year").length,12);
 assert.equal(periodColumns("2024-09-09","year")[1].until,"2024-02-29");
});
test("navigation clamps months and leap dates without skipping a period",()=>{
 assert.equal(shiftPeriod("2026-01-31","month",1),"2026-02-28");
 assert.equal(shiftPeriod("2024-02-29","year",1),"2025-02-28");
 assert.equal(shiftPeriod("2026-12-31","day",1),"2027-01-01");
 assert.equal(shiftPeriod("2026-09-09","week",-1),"2026-09-02");
 assert.equal(validDay("2026-02-30"),false);assert.equal(validDay("2024-02-29"),true);
});
