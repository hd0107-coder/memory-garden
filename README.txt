기억정원 VR 웹 (Memory Garden WebXR)

[내 컴퓨터에서 바로 열어 보기]
index.html을 더블클릭하면 열리지 않아요. 터미널에서 이 폴더로 이동한 뒤
  python3 -m http.server 8000
을 입력하고, 브라우저에서 http://localhost:8000 을 여세요.

[GitHub Pages에 올리기]
1. GitHub에서 새 저장소(Repository)를 만들고 Public으로 설정합니다.
2. "Add file" > "Upload files"로 이 폴더 안의 모든 파일과 폴더를 그대로 올립니다.
   (index.html이 저장소 맨 위에 있어야 해요)
3. Settings > Pages > Branch를 main / (root)로 정하고 Save를 누릅니다.
4. 1~2분 뒤 https://아이디.github.io/저장소이름/ 주소로 열 수 있어요.

[Windows + 헤드셋에서 실행]
1. Quest는 Quest Link(또는 Air Link)를 켜고, 다른 헤드셋은 SteamVR을 켭니다.
2. Windows의 Chrome에서 위 https 주소를 엽니다.
3. "마이크 허용하기"를 한 번 누르고, "VR 시작하기"를 누릅니다.

[조작]
- 왼쪽 스틱: 걷기 / 오른쪽 스틱 좌우: 회전 (순간 이동 없음)
- X 또는 A: 메뉴 / B 또는 Y: 닫기 / 쥐기 버튼을 누른 채 말하기: 음성
- 헤드셋 없이: "화면으로 둘러보기", 마우스 클릭, W A S D, M(메뉴), V(말하기)
