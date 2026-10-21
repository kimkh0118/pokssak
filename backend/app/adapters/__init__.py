"""공공 API 어댑터. 기관마다 요청값이 달라서 각 파일에서 조회 조건을 따로 만든다.

| 서비스 | 제공기관 | 엔드포인트 | 인증 |
|---|---|---|---|
| 도로명주소 검색 | 행정안전부 | business.juso.go.kr/addrlink/addrLinkApi.do | confmKey |
| 건축물대장 표제부 | 국토교통부 건축HUB(공공데이터포털 15134735) | apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo | serviceKey |
| 단독·다가구 매매 실거래 | 국토교통부(공공데이터포털 15126465) | apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade | serviceKey |
| 토지 매매 실거래 | 국토교통부(공공데이터포털 15126466) | apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade | serviceKey |
| 토지특성 | 국토교통부 브이월드 | api.vworld.kr/ned/data/getLandCharacteristics | key + Referer |
| 토지이용계획 | 국토교통부 브이월드 | api.vworld.kr/ned/data/getLandUseAttr | key + Referer |

서비스는 6개, 인증키는 3종(주소·공공데이터포털 계정·브이월드)이다. 공공데이터포털은 서비스별 활용신청이 따로 필요하다.
"""
