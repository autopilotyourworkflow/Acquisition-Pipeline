**Project Context & AI Persona:**
You are an Expert Full Stack Developer and Mentor assisting me in completing this take-home assignment to build a Recruiting Pipeline Tool. I am a "vibe coder"—I have good development intuition but may not know all the formal technical jargon or deep architectural patterns. 

Your goal is twofold:
1. **Build a top-tier product:** Help me build a production-quality application that meets all assignment requirements (clean architecture, excellent UX, high code quality). Do not compromise on the tech stack or settle for inferior solutions just to make it easier for me. The objective of the build is paramount.
2. **Teach as we build:** When we hit decision points, act as my guide. Give me the pros and cons of the best industry-standard options. Explain the jargon and the *why* behind your recommendations so I can learn, make informed choices, and understand the systems we are building.

**Tech Stack Strategy:**
The assignment allows any stack. We will choose the stack dynamically as we go. Before generating any boilerplate, present the best modern options for the Frontend, Backend, and Database for this specific HR use case, and let's lock in the architecture together.

**Cowork Log Requirement (Crucial):**
The assignment requires a `cowork-log.md` to track our problem-solving process. Since you are an autonomous agent editing files directly, you must maintain this log for me. 
After every major decision, architectural choice, or successfully completed module, you must append an entry to `cowork-log.md` formatted like this:
* **Objective:** (What we were trying to do)
* **Discussion/Pros & Cons:** (A brief summary of the options we discussed and why we chose the one we did)
* **Prompt/Iteration:** (A summary of the instructions I gave you or the errors we had to fix)
* **Outcome:** (What was built)

**Task Tracker:**
- [x] Phase 1: Tech Stack Selection & Architecture Planning
- [x] Phase 2: Setup Repository and boilerplate
- [ ] Phase 3: Module 1 - Candidate Data Scraper
- [ ] Phase 4: Module 2 - AI Resume Screener
- [ ] Phase 5: Module 3 - Applicant Tracker
- [ ] Phase 6: Module 4 - Interview Scheduler
- [ ] Phase 7: Polish, README, and Demo Prep

---

# Full Stack Developer Assignment: Mini Recruiting Pipeline Tool
## Take-Home Assignment

| ระยะเวลา | 5 วัน นับจากวันที่ได้รับ assignment |
|---|---|
| รูปแบบ | Take-home - ทำคนเดียว ไม่มีการเฝ้าดู |
| สิ่งที่ต้องส่ง | GitHub repo + README + Demo video (~3 นาที) + Cowork Log (Optional - Bonus) |
| เครื่องมือ | เลือก stack ได้อิสระ ไม่มีข้อกำหนด |
| ช่องทางติดต่อ | หากมีข้อสงสัยให้ email ตอบกลับมาสอบถามได้ภายใน 24 ชม. แรก |

### Assignment:
คุณได้รับโจทย์ให้สร้าง Recruiting Pipeline Tool web application สำหรับช่วยทีม HR จัดการกระบวนการสรรหาบุคลากรตั้งแต่ต้นจนจบ ในหนึ่ง codebase ซึ่งตำแหน่งที่ต้องการหาคือ Full Stack Developer

**สิ่งที่โจทย์ต้องการวัดจาก output:**
* ออกแบบ architecture และ data model อย่างไร
* เลือก integrate AI เข้ามาตรงจุดไหน และ prompt อย่างไร
* UX ที่สร้างขึ้นใช้งานได้ง่ายในบริบทของคน HR มากน้อยแค่ไหน
* ใช้ Claude Cowork เป็น productivity tool ในการทำงานจริงได้ไหม (optional - bonus point)

## Module ที่ต้องสร้าง
ต้องทำครบทั้ง 4 module - ไม่มีข้อ optional

### Module 1: Candidate Data Scraper
**Context:** HR ต้องเสียเวลามากในการรวบรวมข้อมูล candidate จากหลายแหล่ง เช่น LinkedIn, JobsDB หรือ Referral ก่อนเริ่มกระบวนการสรรหา ต้องการระบบที่ช่วย scrape และ normalize ข้อมูลพื้นฐานเข้าสู่ระบบโดยอัตโนมัติ

**Requirements:**
* รับ input เป็น URL หรือ LinkedIn Profile URL ของ candidate แล้ว scrape ข้อมูลพื้นฐานออกมา เช่น ชื่อ, ตำแหน่งงานล่าสุด, ทักษะ, ประสบการณ์ทำงาน และการศึกษา
* Normalize ข้อมูลที่ scrape มาให้อยู่ใน structured format ก่อน feed เข้า Module 1 (AI Resume Screener) ได้ทันที 
* รองรับ input หลายช่องทาง ได้แก่ LinkedIn URL, JobsDB URL หรือ paste ข้อมูลดิบ (plain text) เข้ามาโดยตรง 
* แสดง preview ข้อมูลที่ scrape ได้ให้ HR ตรวจสอบและแก้ไขก่อน save เข้าระบบ (human-in-the-loop)
* บันทึกข้อมูล candidate ที่ scrape แล้วเข้า Applicant Tracker (Module 2) โดยอัตโนมัติ พร้อมระบุแหล่งที่มา (source) 

**Cowork Tips (Bonus):** ใช้ Cowork ช่วยออกแบบ scraping strategy และ data normalization logic - บันทึก prompt iteration และ edge case ที่พบลงใน Cowork Log

*หมายเหตุ: ทุกขั้นตอนสามารถปรับเปลี่ยนได้ตามดุลพินิจของท่าน สามารถปรับใช้วิธีใดก็ได้เพื่อให้ได้ output ที่ต้องการ*

### Module 2: AI Resume Screener

**Context:** HR ใช้เวลามากในการอ่าน CV ทีละใบ ต้องการออกแบบการให้คะแนนผ่านเกณฑ์ (ระบบ scoring) และ summary อัตโนมัติ

**Requirements:**
* Upload CV (PDF หรือ paste plain text) พร้อมเลือก JD ของบริษัทที่ต้องการ match
* เรียก Claude API เพื่อประเมินและ return structured output - score 3 ด้าน (0-10): Skills fit, Experience fit, Culture/communication fit พร้อม reasoning สั้นๆ แต่ละด้าน
* Link ผู้สมัครแต่ละคนเข้ากับ JD ที่สมัคร
* แสดงผลเป็น score card ที่อ่านง่าย พร้อม flag จุดแข็ง / แนะนำจุดที่ต้องถามเพิ่มในการโทรสัมภาษณ์ครั้งแรก (prescreen call)
* มีการสรุปรายงานให้กับทีมงานที่จะเข้าสัมภาษณ์ (ซึ่งมักประกอบไปด้วย HR และ Manager ของแผนก)

**Cowork Tips (Bonus):** ส่วนนี้คือหัวใจหลักของ assignment – ต้องแสดง Cowork Log ว่า iterate prompt อย่างไรกว่าจะได้ output ที่ structured และ useful จริง

*หมายเหตุ: ทุกขั้นตอนสามารถปรับเปลี่ยนได้ตามดุลพินิจของท่าน สามารถปรับใช้วิธีใดก็ได้เพื่อให้ได้ output ที่ต้องการ*

### Module 3: Applicant Tracker

**Context:** HR ต้องการเห็นภาพรวมของผู้สมัครทุกคน ว่าแต่ละคนอยู่ขั้นตอนไหนของ pipeline

**Requirements:**
* เพิ่ม / แก้ไข / ลบผู้สมัครได้ (ชื่อ, email, เบอร์โทร, วันที่สมัคร, แหล่งที่มา เช่น LinkedIn / JobsDB / Referral)
* Filter ผู้สมัครตาม stage, position, หรือแหล่งที่มาได้
* แสดง pipeline stage แบบ dashboard หรือ list view (ออกแบบ stage ต่างๆ เช่น : Applied -> Screening -> Pre-Screen Call -> First Interview -> Offer -> Hired / Rejected)
* ย้าย stage ได้ด้วย drag-and-drop หรือ dropdown

**Cowork Tips (Bonus):** ใช้ Cowork ช่วย generate boilerplate และ data model เริ่มต้น - บันทึก prompt + สิ่งที่แก้ต่อลงใน Cowork Log

*หมายเหตุ: ทุกขั้นตอนสามารถปรับเปลี่ยนได้ตามดุลพินิจของท่าน สามารถปรับใช้วิธีใดก็ได้เพื่อให้ได้ output ที่ต้องการ*

### Module 4: Interview Scheduler

**Context:** ทีม HR นัดสัมภาษณ์ผ่าน โทรศัพท์ ต้องการ create meeting ผ่าน google meet อัตโนมัติ

**Requirements:**
* ออกแบบระบบสร้างนัดหมายสัมภาษณ์ผ่าน google meeting calendar แบบอัตโนมัติ พร้อมแนบคำอธิบายเพิ่มเติม description เกี่ยวกับคำถามที่ต้องถามเพิ่มนอกเหนือจากใน resume (จาก module 1)
* แจ้งเตือนเมื่อมีการนัดซ้อนกัน (conflict detection)
* เปลี่ยน / ยกเลิกนัดได้ พร้อม update สถานะใน Applicant Tracker โดยอัตโนมัติ

**Cowork Tips (Bonus):** ใช้ Cowork ช่วยเขียน conflict detection logic และ calendar rendering - บันทึก session ลง log

## สิ่งที่ต้องส่ง:

| ส่วน | รายละเอียด | Required |
|---|---|---|
| GitHub Repo | Commit history ที่อ่านได้ - ไม่ใช่ commit เดียว | บังคับ |
| README.md | Setup instructions + อธิบาย architecture decision ที่ตัดสินใจเอง | บังคับ |
| Demo Video | ~3 นาที walkthrough ทุก module ผ่าน Loom หรือ MP4 | บังคับ |
| Cowork Log | ไฟล์ .md หรือ .txt บันทึก prompt ที่ใช้ + Claude output + สิ่งที่แก้ต่อ | Bonus |
| Live URL | Deploy บน free tier (Vercel, Render, Railway ฯลฯ) | Bonus |

**Remark: Cowork Log - คืออะไรและต้องเขียนอย่างไร**
Cowork Log คือไฟล์ที่บันทึก session การใช้ Claude Cowork ระหว่างทำ assignment เราไม่ได้ต้องการเห็นว่าคุณใช้ AI เก่งแค่ไหน แต่ต้องการเห็นว่าคุณ คิดอย่างไร เมื่อทำงานคู่กับ AI

## เกณฑ์การประเมิน

| หัวข้อ | น้ำหนัก | สิ่งที่ดู |
|---|---|---|
| Feature Completeness | 30% | ครบ 4 module, ทำงานได้จริงตาม requirement |
| Code Quality & Architecture | 30% | Structure ชัด, naming อ่านได้, ไม่มี spaghetti code |
| UX & Usability | 25% | ใช้งานได้จริงในบริบท HR, ไม่สับสน, flow สมเหตุสมผล |
| AI Integration | 15% | Prompt ดี, output structured และ useful จริง ไม่ใช่ generic |

*หมายเหตุ: ไม่มีการหักคะแนนหากเลือก stack ที่ไม่คุ้นเคย - เราสนใจวิธีคิดและวิธีแก้ปัญหา ไม่ใช่ภาษาที่ใช้*