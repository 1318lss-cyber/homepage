# 두드림모터스 × 몰던카 자동 동기화 홈페이지

몰던카의 **판매자 미니홈피에 공개된 판매 중 차량**을 읽어 차량 사진·가격·연식·주행거리·연료·사고이력·설명·성능점검 링크를 `data/cars.json`으로 만들고, 두드림 홈페이지가 이 파일을 표시합니다.

## 동작 방식

1. 몰던카에 차량을 등록·수정·판매완료 처리합니다.
2. GitHub Actions가 매시 17분과 47분(약 30분 간격)에 판매자 미니홈피를 확인합니다.
3. 판매 중 차량 상세와 사진 URL을 `data/cars.json`에 반영합니다.
4. GitHub Pages가 변경된 데이터를 자동으로 배포합니다.

몰던카 목록에서 내려간 차량은 다음 동기화 때 홈페이지에서도 사라집니다. 사진 파일을 복제하지 않고 몰던카가 공개한 원본 사진 URL을 사용합니다.

## 연결된 판매자

현재 저장소는 이성신 판매자 미니홈피 `contactID=65818`에 연결되어 있습니다.

## 판매자를 변경할 때

본인의 몰던카 판매자 미니홈피 주소가 아래와 같다면 `contactID`는 `12345`입니다.

```text
http://moldeoncar.com/manager/?contactID=12345
```

`.github/workflows/sync-cars.yml`의 `MOLDEON_CONTACT_ID` 값을 새 숫자로 변경하세요.

## 현재 홈페이지에 적용

1. **Actions → 몰던카 차량 자동 동기화 → Run workflow**를 실행할 수 있습니다.
2. 작업 결과의 `data/cars.json`에 이성신 판매자 차량만 들어갔는지 확인합니다.
3. GitHub Pages 배포 완료 후 PC와 휴대폰에서 차량 목록·상세·전화·문자 버튼을 확인합니다.

로컬 확인:

```bash
MOLDEON_CONTACT_ID=12345 node scripts/sync-moldeon.mjs
npx serve .
```

PowerShell:

```powershell
$env:MOLDEON_CONTACT_ID = "12345"
node scripts/sync-moldeon.mjs
npx serve .
```

## 주의사항

- 몰던카의 자동 수집·재게시 허용 범위와 이용약관을 먼저 확인하고, 본인 또는 소속 상사의 차량만 연동하세요.
- 몰던카 화면 구조가 변경되면 `scripts/sync-moldeon.mjs`의 파서를 조정해야 할 수 있습니다.
- `http://moldeoncar.com`이 GitHub Actions 접속을 제한하면 몰던카에 공식 API 또는 제휴 피드 제공을 요청하는 방식으로 교체해야 합니다.
- 현재 연락처와 사업자 정보는 기존 두드림 홈페이지 기준입니다. 실제 정보와 다르면 `index.html`에서 수정하세요.
