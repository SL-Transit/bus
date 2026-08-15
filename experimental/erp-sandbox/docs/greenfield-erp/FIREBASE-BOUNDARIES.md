# Firebase Boundaries

Paths ต่อไปนี้เป็น proposal เท่านั้น ยังไม่อนุญาตให้สร้างใน Firebase จนกว่าจะมี Rules/Emulator PR และ Owner approval แยก

## RTDB Layout

    /data/erpDataCenter/
      importPackages/{packageId}/metadata
      authoring/drafts/{draftId}/
        metadata
        entities/{entityType}/{entityId}
        validation/{runId}
        reviews/{reviewId}
        approval
      access/accounts/{uid}
      audit/events/{eventId}
      publication/history/{versionId}

    /publishedReadModels/
      current/
        versionId
        schemaVersion
        publishedAt
        manifestHash
      versions/{versionId}/
        manifest
        operatorsById
        locationsById
        platformsByLocationId
        routesById
        patternsByRouteId
        patternStopsByPatternId
        calendarsById
        fixedTripsByRouteDate
        stopTimesByTripId
        frequenciesByRouteDate
        fareProductsById
        fareRulesByRouteId
        transfersByLocationId
        networkIndexes

Booking, Payment, GPS และ live operations ต้องมี namespace/lifecycle แยก

## Storage Layout

    erp-import-quarantine/{packageId}/source.xlsx
    erp-import-rejected/{packageId}/...
    erp-approved-assets/{assetId}/...

Quarantine ต้องไม่ public และต้องตรวจชนิด ขนาด checksum และ security policy ก่อน parse

## Write Ownership

| Path | Browser | ERP Backend | Publisher | Consumer |
|---|---:|---:|---:|---:|
| importPackages | no direct write | metadata | read | no |
| authoring/drafts | no direct write | scoped write | approved read | no |
| access/accounts | no | authorized admin service | read | no |
| audit/events | no | append only | append only | no |
| publication/history | no | read | append only | no |
| published versions | no | no | immutable create | bounded read |
| current pointer | no | no | atomic switch | read |

## Authorization

Custom Claims เก็บเฉพาะ coarse role และมีระยะเผื่อต่ำกว่า limit 1,000 bytes ส่วน fine-grained permission เก็บที่ `/data/erpDataCenter/access/accounts/{uid}` Backend ตรวจสิทธิ์ทุก command; การซ่อนปุ่มใน UI ไม่ใช่ authorization

## Security Rules Direction

- Root read/write เป็น false
- ไม่มี client write ที่ authoring, publication, access หรือ audit
- Public read เปิดเฉพาะ node ที่ต้องใช้จริงหรือผ่าน API
- ห้าม broad allow ที่ path ตื้น
- กำหนด validate และ index ตาม query contract
- Backend Admin SDK ต้องมี authorization/validation/audit เอง
- Rules ต้องผ่าน Emulator allow/deny matrix ก่อน deploy

## Cost Boundaries

- ห้าม listener/read ที่ root หรือ version root
- Listener ระยะยาวใช้เฉพาะ pointer/live state ขนาดเล็ก
- ข้อมูลใหญ่ใช้ bounded query/pagination
- Binary เก็บใน Storage
- Manifest มี byte/entity/chunk count และ checksum
- Internal write chunk ไม่เกิน 5 MB/5,000 leaf paths
- เริ่ม minInstances เป็น 0 และกำหนด maxInstances
- มี budget alert, timeout, quota และ response-size limit ก่อน Production
- ตรวจ Firebase official limits ใหม่ ณ เวลา implementation