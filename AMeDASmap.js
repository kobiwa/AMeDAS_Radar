//▼ここから関数集

// 【修正箇所】グラフ描画の競合回避用変数
var sCurrentCode = null;

//GETパラメータ取得
function GetParams(){
	let sQuery = window.location.search.replace(/^\?/,'');
	if(!sQuery) {return;}
	
	let sParams = sQuery.split('&');
	let bFlgT=0, bFlgP=0;
	let sMap='NA';
	for(let i=0; i < sParams.length; i++){
		let elem = sParams[i].split('=');
		if(elem.length < 2) {continue;}
		
		if(elem[0]=='lat' && !isNaN(elem[1])){dLat=Number(elem[1]); bFlgP=1; }
		else if(elem[0]=='lon'&& !isNaN(elem[1])){dLon=Number(elem[1]); bFlgP=1; }
		else if(elem[0]=='z'&& !isNaN(elem[1])){iZoom=Number(elem[1]);  bFlgP=1; }
		else if(elem[0]=='t0'&& !isNaN(elem[1])){dMinT=Number(elem[1]); bFlgT=1; }
		else if(elem[0]=='dt'&& !isNaN(elem[1])){dTStep=Number(elem[1]); bFlgT=1; }
		else if(elem[0]=='b_map'){ sMap=elem[1]; }
	}
	
	//位置・縮尺設定
	if(bFlgP){
		map.setView([dLat, dLon], iZoom);
	}
	
	//気温設定(HTML上のコントロール反映)
	if(bFlgT){
		document.legend_temp.elements[0].checked = false;
		document.legend_temp.elements[1].checked = true;
		$('[name="tscale"]').val("original");
		document.legend_temp.elements[2].value=dMinT;
		document.legend_temp.elements[3].value=dTStep;
		document.legend_temp.elements[2].disabled=false;
		document.legend_temp.elements[3].disabled=false;
	}
	
	//背景図選択
	if(sMap == 'blk' || sMap == 'shd' || sMap == 'pal'){
		$('[name=lyr]').val([sMap]);
		SelectMap(sMap);
	}
}

//最新時刻から288個(48時間分:6x48hr)の時刻を取得してOptionタグに追加する
function GetTimes(){
	let url='https://www.jma.go.jp/bosai/amedas/data/latest_time.txt';
	let rd = new FileReader();
	let xmlHttp = new XMLHttpRequest();
	xmlHttp.open("GET",url,true);
 	xmlHttp.send(null);
	xmlHttp.onload = function(){
		let data = xmlHttp.responseText;
		let dt = new Date(data);
		let elSel = document.getElementById("lsDateTime");
		
		//まず削除
		while(elSel.lastChild){elSel.removeChild(elSel.lastChild);}
		$("#btnExpandMenu").css({'padding': ""});
		$("#menu").css({'width': ""});
		
		GetObsInfo(formatDate(dt, "yyyyMMddHHmmss"));
		while(elSel.lastChild){ elSel.removeChild(elSel.lastChild); }
		for(let i = 1; i <= 288; i++){
			let elOpt = document.createElement("option");
			elOpt.text = formatDate(dt, "yyyy/MM/dd HH:mm");
			elOpt.value = formatDate(dt, "yyyyMMddHHmmss");
			elSel.appendChild(elOpt);
			dt.setMinutes(dt.getMinutes() - 10);
		}
		//メニューの幅を固定する
		let w = $("#menu").outerWidth(true);
		$("#menu").css({'width':w+10+"px"});
		
		//メニュー二段目の調整
		let w1 = $("#btnExpandMenu").outerWidth(true);
		let w2 = $("#btnCurPos").outerWidth(true);
		let p = (w-w1-w2)/2;
		$("#btnExpandMenu").css({'padding':"1px " + p+"px"});
		
		//メニュー(追加設定)の調整
		document.getElementById("sldRadar").style.width = (w-60)+"px";
		if($('[name="tscale"]').val() != "original"){
			document.legend_temp.elements[2].disabled=true;
			document.legend_temp.elements[3].disabled=true;
		}
	}
}

//メニュー表示・非表示
function ExpandMenu(){
	let elSub = document.getElementById("menu_sub");
	if(elSub.style.display=="block"){elSub.style.display="none";}
	else{elSub.style.display="block";}
}

//リストボックスで選択された日付を渡す(AMeDAS)
function GetSelectedDateForA(){
	//リストボックスで選択された値(日付:yyyyMMddHHmmSS)
	const DateTime = document.getElementById("lsDateTime").value;
	GetObsInfo(DateTime);
}

//±10分
function OffsetTime(iShift){
	let elOpt = document.getElementById("lsDateTime");
	let i;
	if(elOpt.selectedIndex+iShift < 0){
		i = 0;
	} else if(elOpt.options.length <= elOpt.selectedIndex+iShift){
		i = elOpt.options.length-1;
	} else {
		i = elOpt.selectedIndex+iShift;
	}
	elOpt.options[i].selected = true;
	GetObsInfo(elOpt.options[i].value);
}

//観測点の情報を持っているか判別した後で観測値取得関数を呼び出す
function GetObsInfo(DateTime){
	const url='https://www.jma.go.jp/bosai/amedas/const/amedastable.json';
	if(!htObsInfo){
		$.getJSON(url)
			.done(
				function(data, status, xhr){ htObsInfo = data; GetObsData(DateTime); }
			);
	} else {
		GetObsData(DateTime);
	}
}

//観測値を取得する
function GetObsData(DateTime){
	const url='https://www.jma.go.jp/bosai/amedas/data/map/' + DateTime +'.json';
	$.getJSON(url)
		.done(function(ObsData, status, xhr){
			//リセット
			gjPoints = new GeoJson();
			if(lyTempStr != null && map.hasLayer(lyTempStr)){ map.removeLayer(lyTempStr); lyTempStr=null; }
			if(lyTempCrl != null && map.hasLayer(lyTempCrl)){ map.removeLayer(lyTempCrl); lyTempCrl=null;}
			if(lyWindBarbL != null && map.hasLayer(lyWindBarbL)){ map.removeLayer(lyWindBarbL); lyWindBarbL=null;}
			if(lyWindBarbS != null && map.hasLayer(lyWindBarbS)){ map.removeLayer(lyWindBarbS); lyWindBarbS=null;}

			//▼GeoJSON作成
			for (let code in ObsData) {
				if(code in htObsInfo === false) {continue;} //観測点情報が取れない場合は表示しない
				let dLon = htObsInfo[code].lon[0]+htObsInfo[code].lon[1]/60;
				let dLat = htObsInfo[code].lat[0]+htObsInfo[code].lat[1]/60;
				let dTemp = 'NA';
				if('temp' in ObsData[code]){
					if(ObsData[code].temp[1] == 0){ dTemp = ObsData[code].temp[0]; }
				}
				let dPrec1h = 'NA';
				if('precipitation1h' in ObsData[code]){
					if(ObsData[code].precipitation1h[1] == 0){ dPrec1h = ObsData[code].precipitation1h[0]; }
				}
				let dWindDir = 'NA';
				let dWindSpd = 'NA';
				if('wind' in ObsData[code]){
					if(ObsData[code].wind[1] == 0){ dWindSpd = ObsData[code].wind[0]; }
					if(ObsData[code].windDirection[1] == 0){ dWindDir = ObsData[code].windDirection[0]; }
				}
				
				//富士山の例外処理(毎正時だけ相対湿度と気圧が観測されている)
				if(code == "50066"){
					if(ObsData["50066"].humidity == null){ ObsData["50066"].humidity=new Array(null, null);	}
					if(ObsData["50066"].pressure == null){ ObsData["50066"].pressure=new Array(null, null);	}
				}
				
				//gjPoints:GeoJsonクラス→少し下で定義している(GeoJSONの書式に準拠)
				//PointFeatureクラス→こちらも下で定義、GeoJSONの地物の書式に準拠
				gjPoints.features.push(new PointFeature(dLon, dLat, code, DateTime, dTemp, dPrec1h, dWindDir, dWindSpd, ObsData));
  			}
  			
  			//▼レイヤ作成
  			//AMeDAS気温(str)
  			lyTempStr = L.geoJSON(gjPoints, {
  				interactive: false,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.Temp)){
  						let sCls = Temp2Cls(feature.properties.Temp);
  						let sTemp = feature.properties.Temp.toFixed(1);
  						return L.marker(latlng, {interactive:false, icon:L.divIcon({html:sTemp, className:sCls, iconSize:[50,16], iconAnchor:[25,-5], zIndexOffset:2000})});
  					}
  				}
  			});
			
  			//AMeDAS気温(Cercle)
  			lyTempCrl = L.geoJSON(gjPoints, {
  				interactive: false,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.Temp)){
  						let dT = feature.properties.Temp;
  						return L.circleMarker(latlng, {
  							interactive:false, radius:4, fillColor:Temp2Color(dT), fillOpacity:1, color:"#000000", weight:0.5, pane:"PaneCircle",
  							attribution: "<a href='http://www.jma.go.jp/'>AMeDAS & 降水ナウキャスト:気象庁</a>" 
  						});
  					} else {
  						return L.circleMarker(latlng, {
  							interactive:false, radius:2, fillColor:"#404040", fillOpacity:1, color:"#000000", weight:0.5, pane:"PaneCircle",
  							attribution: "<a href='http://www.jma.go.jp/'>AMeDAS & 降水ナウキャスト:気象庁</a>" 
  						});
  					}
  				}
  			});
			
  			//AMeDAS観測点…ポップアップ表示用
  			lyObsPos = L.geoJSON(gjPoints, {
  				pointToLayer: function(feature, latlng){
  					return L.circleMarker(latlng, {
  						radius:20, fillColor:"#000000", fillOpacity:0.0, color:"#000000", opacity:0.0,
  					});
  				}
  			});
  			lyObsPos.on("click", function(e){DrawGraph(e)}); //クリックイベント(ポップアップ用)
  			
  			//AMeDAS観測点名称
  			lyObsName = L.geoJSON(gjPoints, {
  				interactive: false,
  				pointToLayer: function(feature, latlng){
  					return L.marker(latlng, {interactive:false, icon:L.divIcon({html:feature.properties.Name, className:"StrPos", iconSize:[80,17], iconAnchor:[40,16], zIndexOffset:2000})});
  				}
  			});
			
  			//AMeDAS風向風速(矢羽大)
  			lyWindBarbL = L.geoJSON(gjPoints, {
  				interactive: false,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.WindSpd) && !isNaN(feature.properties.WindDir)){
  						let iSpd = Math.round(feature.properties.WindSpd);
  						if(MaxWind < iSpd){iSpd = 99;}
  						let ico = L.icon({
  							iconUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconRetinaUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconSize: [16.5, 47.25],
  							iconAnchor: [2.25, 47.25],
  							popupAnchor: [0, 0],
  						});
  						let dAng = 22.5 * feature.properties.WindDir;
  						return L.marker(latlng, {interactive:false, icon:ico, rotationAngle: dAng});
  					}
  				}
  			});
			
  			//AMeDAS風向風速(矢羽小)
  			lyWindBarbS = L.geoJSON(gjPoints, {
  				interactive: false,
  				pointToLayer: function(feature, latlng){
  					if(!isNaN(feature.properties.WindSpd) && !isNaN(feature.properties.WindDir)){
  						let iSpd = Math.round(feature.properties.WindSpd);
  						if(MaxWind < iSpd){iSpd = 99;}
  						let ico = L.icon({
  							iconUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconRetinaUrl:'./svg_barb/'+('00' + iSpd).slice(-2)+'.svg',
  							iconSize: [11, 31.5],
  							iconAnchor: [1.5, 31.5],
  							popupAnchor: [0, 0],
  						});
  						let dAng = 22.5 * feature.properties.WindDir;
  						return L.marker(latlng, {interactive:false, icon:ico, rotationAngle:dAng});
  					}
  				}
  			});
  			map.addLayer(lyTempCrl);
  			map.addLayer(lyObsPos);
  			LayerSwitchByZScale();
		});
	//レーダーの表示制御
	if(document.getElementById("btnRadar").text != "非表示"){
		GetRadarTimes(DateTime);
	}
}

//レーダーの時刻を取得する
function GetRadarTimes(AMeDAS_Date){
	arRadarTs = new Array();
	const url='https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json';
	$.getJSON(url)
		.done(
			function(data, status, xhr){
				for(let i in data){
					arRadarTs.push(data[i].basetime+data[i].validtime);
				}
				AddRadarLayer(AMeDAS_Date);
			}
		);
}

//レーダーのレイヤを追加する
function AddRadarLayer(AMeDAS_Date){
	if(lyRadar != null && map.hasLayer(lyRadar)){map.removeLayer(lyRadar); lyRadar=null;}
	let dtAMeDAS = Fmtd2DateTime(AMeDAS_Date);
	dtAMeDAS.setHours(dtAMeDAS.getHours() - 9); //JST→UTC
	AMeDAS_Date = formatDate(dtAMeDAS, "yyyyMMddHHmmss");
	let elRdr = document.getElementById("btnRadar");
	let dOpacity = 1 - Number(elSlider.value) /100;
	for(let i=0; i < arRadarTs.length; i++){
		let sB = arRadarTs[i].substring(0,14);
		let sV = arRadarTs[i].substring(14,28);
		if(sV == AMeDAS_Date){
			lyRadar = L.tileLayer.ZoomSubstitute('https://www.jma.go.jp/bosai/jmatile/data/nowc/'+sB+'/none/'+sV+'/surf/hrpns/{z}/{x}/{y}.png',
				{minZoom:4, maxZoom:16, maxNativeZoom:10, opacity:dOpacity, pane:"PaneRadar", tileSize: 256}
			);
			map.addLayer(lyRadar);
			elRdr.text = "表示中";
			return;
		}
	}
	elRdr.text = "表示不可";
}

//レーダー画像の表示・非表示切り替え
function SwitchRadar(){
	if(map.hasLayer(lyRadar)){
		map.removeLayer(lyRadar);
		let elRdr = document.getElementById("btnRadar");
		elRdr.text = "非表示";
	}
	else{
		const AMeDAS_Date = document.getElementById("lsDateTime").value;
		AddRadarLayer(AMeDAS_Date)
	;}
}

//レーダー画像の透過度(スライダ)
function ChangeRadarOpacity(){
	if(lyRadar && map.hasLayer(lyRadar)){
		let dOpacity = 1 - Number(elSlider.value) /100;
		lyRadar.setOpacity(dOpacity);
	}
}

//ZoomLevelが奇数の場合対策
(function () {
	if (typeof L === 'undefined') {
		throw new Error('Leaflet must be loaded before the ZoomSubstitute plugin.');
	}
	L.TileLayer.ZoomSubstitute = L.TileLayer.extend({
		createTile: function (coords, done) {
			const actualZoom = coords.z;
			const useZoom = (actualZoom % 2 === 1) ? actualZoom - 1 : actualZoom;
			if (coords.z % 2 == 0){
				//偶数Zoomのとき → そのままタイル出力
				const tile = document.createElement('img');
				tile.setAttribute('role', 'presentation');
				tile.className = 'leaflet-tile';
				const url = L.Util.template(this._url, {
					s: this._getSubdomain(coords),
					z: coords.z,
					x: coords.x,
					y: coords.y
				});
 				tile.onload = L.bind(this._tileOnLoad, this, done, tile);
 				tile.onerror = L.bind(this._tileOnError, this, done, tile);
 				tile.src = url;
				return tile;
			} else {
				//奇数Zoomのとき → zoom-1のタイルを引き延ばして表示する
				const scale = 2;
				const tileSize = this.options.tileSize;
				
				const X2 = Math.floor(coords.x / scale);
				const Y2 = Math.floor(coords.y / scale);
				const deltX = (coords.x % 2 == 0) ? 0 : -tileSize;
				const deltY = (coords.y % 2 == 0) ? 0 : -tileSize;
				
				//親要素にDivを追加
				const tileP = document.createElement('div');
				tileP.style.width = tileSize + 'px';
				tileP.style.height = tileSize + 'px';
				tileP.style.overflow= 'hidden'; //拡大した画像の範囲外の部分を隠すため
				const url = L.Util.template(this._url, {
					s: this._getSubdomain(coords),
					z: coords.z - 1,
					x: X2,
					y: Y2
				});
				
				const tileC = document.createElement('img');
				tileC.style.width = tileSize + 'px';
				tileC.style.height = tileSize + 'px';
				tileC.style.transformOrigin = 'top left';
				tileC.style.transform = 'translate(' + deltX + 'px, ' + deltY + 'px) scale(' + scale + ')';
				tileC.onload = L.bind(this._tileOnLoad, this, done, tileC);
				tileC.onerror = L.bind(this._tileOnError, this, done, tileC);
				tileC.src = url;
				
				tileP.appendChild(tileC);
				return tileP;
			}
		}
	});

	L.tileLayer.ZoomSubstitute = function (url, options) {
		return new L.TileLayer.ZoomSubstitute(url, options);
	};
})();



//▼凡例
//気温から色に対応したクラス名を返す
function Temp2Cls(Temp){
	let i = Math.ceil((Temp-dMinT)/dTStep)
	if(i < 0){i = 0}
	else if(sColors.length <= i){i = sColors.length-1;}
	return "StrTemp" + ('00'+i).slice(-2);
}
function Temp2Color(Temp){
	let i = Math.ceil((Temp-dMinT)/dTStep)
	if(i < 0){i = 0}
	else if(sColors.length <= i){i = sColors.length-1;}
	return sColors[i];
}

//凡例種別制御
jQuery(function() {
	$('[name="tscale"]').on('change', function(){
		let val = $(this).val();
		let elMinT = document.legend_temp.elements[2];
		let elTStep = document.legend_temp.elements[3];
		
		if(val == "jma"){
			elMinT.disabled=true;
			elTStep.disabled=true;
			dMinT = -10;
			dTStep = 5;
			elMinT.value=dMinT;
			elTStep.value=dTStep;
		} else {
			elMinT.disabled=false;
			elTStep.disabled=false;
		}
		// 1. URLを更新
		ReplaceURL();
		// 2. 凡例を再描画（古いのは消してから）
		if(ctLegT){ map.removeControl(ctLegT); ctLegT = null; }
		SwitchLegendT();
		// 3. 気温レイヤーのみ色を更新（※全部作り直すのではなく再描画）
		UpdateTempLayerStyles();
	});
});
// 全データを取得し直さず、既存のレイヤーの色だけ変える（または気温のみ再生成）
function UpdateTempLayerStyles() {
	// 風向や地点名は変えなくていいので、気温に関するレイヤーだけ再処理する
	if (lyTempCrl) {
		lyTempCrl.eachLayer(function(layer) {
			let dT = layer.feature.properties.Temp;
			if(!isNaN(dT)) {
				layer.setStyle({
					fillColor: Temp2Color(dT)
				});
			}
		});
	}
	// 気温の数字(テキスト)レイヤーはclassNameを動的に変えるのが難しいため、
	// ここだけは再作成するか、あるいは一旦削除してGetObsDataを呼ぶ
	// 今回は一番確実な「気温レイヤーのみ再生成」を行う
	let elOpt = document.getElementById("lsDateTime");
	GetObsInfo(elOpt.options[elOpt.selectedIndex].value);
}


//気温のレンジ・幅
function SetTempRange(){
	//凡例再描画
	if(ctLegT){
		map.removeControl(ctLegT);
		ctLegT = null;
	}
	SwitchLegendT();
	let elOpt = document.getElementById("lsDateTime");
	GetObsInfo(elOpt.options[elOpt.selectedIndex].value);
	ReplaceURL();
}

//気温のレンジ・幅
function SetTempRangeOriginal(){
	if(isNaN(document.legend_temp.elements[2].value)){dMinT = -10;}
	else{dMinT = Number(document.legend_temp.elements[2].value);}
	
	if(isNaN(document.legend_temp.elements[3].value)){dTStep = 5;}
	else{dTStep = Number(document.legend_temp.elements[3].value);}
	
	//凡例再描画
	if(ctLegT){
		map.removeControl(ctLegT);
		ctLegT = null;
	}
	SwitchLegendT();
	let elOpt = document.getElementById("lsDateTime");
	GetObsInfo(elOpt.options[elOpt.selectedIndex].value);
	ReplaceURL();
}

//レンジ・幅を凡例に反映
function SwitchLegendT(){
	let elLegend = document.getElementById("btnLegend");
	if(!ctLegT){
		//凡例なし→凡例を作成して地図に追加する
		ctLegT = L.control({position: 'bottomright'});
		ctLegT.onAdd = function(map){
			let div = L.DomUtil.create('div', 'legend');
			div.innerHTML = "Temp.[℃]<br>";
			for(let i=sColors.length-1; 0 <= i; i--){
				let dTU = dMinT + dTStep*i;
				let dTL = dMinT + dTStep*(i-1);
				let dTM = (dTU+dTL)/2;
				if(i == 0){
					div.innerHTML +=
			    	'<i style="background:' + Temp2Color(dTM) + '"></i> &lt; ' + dTU + '<br>';
		    	}else if(i < sColors.length-1){
					div.innerHTML +=
			    	'<i style="background:' + Temp2Color(dTM) + '"></i> ' + dTL + ' &ndash; ' + dTU + '<br>';
		    	} else {
					div.innerHTML +=
			    	'<i style="background:' + Temp2Color(dTM) + '"></i> ' + dTL + ' &lt; <br>';
		    	}
			}
			return div;
		}
		ctLegT.addTo(map);
		elLegend.text = "表示中";

	} else {
		map.removeControl(ctLegT);
		ctLegT = null;
		elLegend.text = "非表示";
	}
}

//▼GeoJson関連の定義
class GeoJson{
	constructor(){
		this.type = 'FeatureCollection';
		this.name = 'AMeDAS';
		this.features = [];
	}
}
class PointFeature{
	constructor(x, y, Code, DateTime, Temp, Prec1h, WindDir, WindSpd, ObsData){
		let sTemp=Temp;
		if(!isNaN(Temp)){sTemp=Temp+'℃';}
		let sPrec1h=Prec1h;
		if(!isNaN(Prec1h)){sPrec1h=Prec1h+'mm';}
		let sWindDir=WindDir;
		if(!isNaN(WindDir)){sWindDir=22.5*WindDir+'°';}
		let sWindSpd=WindSpd;
		if(!isNaN(WindSpd)){sWindSpd=WindSpd+'m/s';}
		
		this.type="Feature";
		this.id=Code;
		this.properties={};
		this.properties['Code']=Code;
		this.properties['Name']=htObsInfo[Code].kjName;
		this.properties['NameKana']=htObsInfo[Code].knName;
		this.properties['Altitude']=htObsInfo[Code].alt;
		this.properties['TempFlg']=0;
		this.properties['Temp']=Temp;
		this.properties['Prec1h']=Prec1h;
		this.properties['WindDir']=WindDir;
		this.properties['WindSpd']=WindSpd;
		this.geometry={};
		this.geometry['type']="Point";
		this.geometry['coordinates']=[x, y];
		
		//主要以外の観測点情報
		this.ObsInfo=htObsInfo[Code];
		this.ObsData=ObsData[Code];
	}
}

//スケールによる表示制御
function LayerSwitchByZScale(){
	iZoom = map.getZoom();
	
	//気温表示
	if(iZoom < 9){
		if(map.hasLayer(lyTempStr)){map.removeLayer(lyTempStr);}
		if(map.hasLayer(lyWindBarbL)){map.removeLayer(lyWindBarbL);}
		if(lyWindBarbS){ map.addLayer(lyWindBarbS);}
	} else {
		if(map.hasLayer(lyWindBarbS)){map.removeLayer(lyWindBarbS);}
		if(lyWindBarbL){map.addLayer(lyWindBarbL);}
		if(lyTempStr) {map.addLayer(lyTempStr);}
	}
	
	//観測点名表示
	if(iZoom < 10){
		if(map.hasLayer(lyObsName)){map.removeLayer(lyObsName);}
	} else {
		if(lyObsName) {map.addLayer(lyObsName);}
	}
}

function AfterMove(){
	iZoom = map.getZoom();
	dLon = map.getCenter().lng.toFixed(6);
	dLat = map.getCenter().lat.toFixed(6);
	ReplaceURL();
	
	if(10 <= iZoom){
		if(lyObsName) {map.addLayer(lyObsName);}
		if(lyTempStr) {map.addLayer(lyTempStr);}
	} else if(9 == iZoom){
		if(lyTempStr) {map.addLayer(lyTempStr);}
	}
}

//URL変更
function ReplaceURL(){
	let sQuery = "lat=" + dLat + "&"
		+ "lon=" + dLon + "&"
		+ "z=" + iZoom + "&b_map=" + $('[name="lyr"]:checked').val();
	
	//気温レンジ
	if(dMinT != -10 || dTStep != 5){
		sQuery = sQuery + "&t0=" + dMinT + "&" + "dt=" + dTStep;
	}
	window.history.replaceState('', '', '?' + sQuery);
}

//背景図選択
jQuery(function() {
	$('[name="lyr"]').on('change', function(){
		let Name = $(this).val();
		ReplaceURL();
		SelectMap(Name);
	});
});
function SelectMap(Name){
	if(Name == "blk"){
		map.removeLayer(lyPal); map.removeLayer(lyShd); map.addLayer(lyBlk);
	} else if (Name == "shd"){
		map.removeLayer(lyPal); map.addLayer(lyShd); map.removeLayer(lyBlk);
	} else if (Name == "pal"){
		map.addLayer(lyPal); map.removeLayer(lyShd); map.removeLayer(lyBlk);
	}
}

//現在地へ移動する
function MoveToCurPos(){
	//現在地取得API対応
	if(!navigator.geolocation){
		alert("位置情報を取得できません(ブラウザが非対応)。");
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#888";
		return;
	}
	
	//位置情報取得Option
	//参考: https://www.achiachi.net/blog/leaflet/geolocation
	let opts = { enableHighAccuracy:false, timeout:5000, maximumAge:0 };
	
	//取得成功時
	function success(pos){ 
		map.setView([pos.coords.latitude, pos.coords.longitude]);
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#08F";
		return;
	}
	
	//取得失敗時
	function fail(ex) { 
		alert("位置情報を取得できません(タイムアウト・ブロック等)。"); 
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#888";
	}
	
	//コマンド実行
	navigator.geolocation.getCurrentPosition(success, fail, opts);
}

//初期表示のPopup
function IndicatePopupNotice(){
	if( !localStorage.getItem('PopupNotice') ) {
	    localStorage.setItem('PopupNotice', 'on');
	    let ppBg = document.getElementById('Popup_Bg');
	    let ppNt = document.getElementById('PopupNotice');
	    ppBg.classList.add('js_active');
	    ppNt.classList.add('js_active');
	    ppBg.onclick = function() {
	        ppBg.classList.remove('js_active');
	        ppNt.classList.remove('js_active');
	    }
	}
}

//PopUpにグラフを表示する
function DrawGraph(e){
	//実処理は別スレッド(async)へ
	setTimeout(DrawGraph_2, 0, e.layer);
	
	//「くるくる」を表示
	IndicateLoading();
}

//PopUpにグラフを表示する(実処理：非同期版)
// 【修正箇所】Async/Awaitを用いた非同期取得 + 競合回避
async function DrawGraph_2(layer){
  try {
    const pps = layer.feature.properties;
    
    // 【修正】現在処理中のコードを記録(Race Condition対策)
    sCurrentCode = pps.Code;

    // 選択された時刻(yyyyMMddHHmmss -> Date)
    const dtNewest = Fmtd2DateTime(document.getElementById("lsDateTime").value);

    // グラフラベル(10分刻みで24時間分 = 144)
    const sLabs = new Array(144);
    let dtDat = new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate());
    for(let i = 0; i < sLabs.length; i++){
      sLabs[i] = formatDate(dtDat, "HH:mm");
      dtDat.setMinutes(dtDat.getMinutes() + 10);
    }

    // データ初期化 (htData はグローバルで既存)
    for(let elem in htData){
      for(let iD = 0; iD < htData[elem].values.length; iD++){
        htData[elem].values[iD] = new Array(sLabs.length).fill(null);
        htData[elem].N = 0;
      }
    }

    // --- 非同期フェッチのヘルパー ---
    async function fetchJSON(url){
      try{
        const resp = await fetch(url, {cache: "no-store"});
        if(!resp.ok) return null;
        return await resp.json();
      } catch(e){
        // ネットワークエラー等は null を返して続行
        console.warn("fetchJSON error:", url, e);
        return null;
      }
    }

    // --- リクエスト URL を作る ---
    // 仕様: iD = 0 (当日), 1 (前日), 2 (前々日)
    const requests = [];
    for(let iD = 0; iD < 3; iD++){
      for(let iH = 0; iH < 24; iH += 3){
        let dt = new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate() - iD);
        dt.setHours(dt.getHours() + iH);
        if(dtNewest < dt) break;
        const url = "https://www.jma.go.jp/bosai/amedas/data/point/" + pps.Code + "/" + formatDate(dt, "yyyyMMdd_HH") + ".json";
        requests.push({url, iD, baseDate: new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate() - iD)});
      }
    }

    // --- 並列実行制限付きマッパー ---
    // CONCURRENCY を適宜調整
    const CONCURRENCY = 4;
    async function mapWithConcurrency(items, worker){
      const results = new Array(items.length);
      let idx = 0;
      const runners = new Array(CONCURRENCY).fill(null).map(async () => {
        while(true){
          const i = idx++;
          if(i >= items.length) break;
          // 【修正】別の地点がクリックされていたら処理を中断
          if(sCurrentCode !== pps.Code) return;
          try{
            results[i] = await worker(items[i], i);
          } catch(e){
            results[i] = null;
          }
        }
      });
      await Promise.all(runners);
      return results;
    }

    // --- worker: 実際に取得して htData を埋める ---
    await mapWithConcurrency(requests, async (req) => {
      // 【修正】別の地点がクリックされていたらfetchしない
      if(sCurrentCode !== pps.Code) return;
      
      const data = await fetchJSON(req.url);
      if(!data) return; // 取得失敗はスキップ

      // 【修正】fetch後に別の地点になっていたら反映しない
      if(sCurrentCode !== pps.Code) return;

      // data は {"yyyyMMddHHmmss": { elem: [value, flag], ... }, ...}
      for(const key in data){
        // idx は 10分間隔インデックス (0..143 等)
        const t = Fmtd2DateTime(key).getTime();
        const base = req.baseDate.getTime();
        const idx = Math.round((t - base) / (10 * 60 * 1000));
        if(idx < 0 || idx >= sLabs.length) continue;

        // layer.feature.ObsData にある要素のみ処理する
        for(const elem in layer.feature.ObsData){
          if(!htData[elem]) continue;
          const cell = data[key][elem];
          if(cell && cell[1] === 0){
            // iD (0/1/2) のスライスに格納
            htData[elem].values[req.iD][idx] = cell[0];
            htData[elem].N++;
          }
        }
      }
    });
    
    // 【修正】最終確認：別の地点がクリックされていたら描画しない
    if(sCurrentCode !== pps.Code) return;

    // --- 日付凡例の更新 ---
    for(let iD = 0; iD < 3; iD++){
      const dtL = new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate() - iD);
      const elLegDay = document.getElementsByClassName('Popup_Legend_Day' + iD);
      for(let i = 0; i < elLegDay.length; i++){
        elLegDay[i].innerHTML = formatDate(dtL, "yyyy/MM/dd");
      }
    }

    // ポップアップ処理
    layer.closePopup();

    const elBg = document.getElementById('Popup_Bg');
    const elGp = document.getElementById('PopupGraph');
    const elTt = document.getElementById('PopupGraph_title');
    const elCt = document.getElementById('PopupGraph_content');
    const elCtTx = document.getElementById('PopupGraph_content_text');

    elTt.innerText = pps.Name + ' (' + pps.NameKana + ' 標高:' + pps.Altitude + 'm)';
    elCtTx.innerHTML = formatDate(dtNewest, "yyyy/MM/dd HH:mm") + '<br>\n';

    // ポップアップ幅制御
    const ppWidth = 600;
    if(ppWidth <= elBg.clientWidth) { elGp.style.width = ppWidth + "px"; }
    else { elGp.style.width = elBg.clientWidth + "px"; }

    // Chart.js 用のデータ生成 & 表示
    for(const elem in htData){
      const cnt = document.getElementById("cnt_" + elem);
      if(htData[elem].N == 0){
        if(cnt) cnt.style.display = "none";
      } else {
        if(cnt) cnt.style.display = "block";
        const cvsEl = document.getElementById("cvs_" + elem);
        if(!cvsEl) continue;
        const cvs = cvsEl.getContext("2d");
        const data = CreateDataForChartJS(sLabs, htData[elem]);

        // Chart オプションの整形
        data.options = {};
        data.options.legend = { display: false };
        data.options.scales = {};
        data.options.scales.yAxes = [];
        data.options.scales.yAxes[0] = { scaleLabel: { labelString: htData[elem].name } };
        data.options.scales.xAxes = [];
        data.options.scales.xAxes[0] = { ticks: { maxTicksLimit: 13 } };

        if(elem === 'precipitation10m'){
          // flatten 3次元配列対応
          const flatVals = [].concat(...htData[elem].values);
          const maxVal = flatVals.length ? Math.max.apply(null, flatVals.filter(v=>v!=null)) : 0;
          if((isFinite(maxVal) ? maxVal : 0) < 1.0){
            data.options.scales.yAxes[0].ticks = { min: 0, max: 1 };
          }
        }

        // 既存チャートがあれば破棄
        if(htCharts[elem]) { try { htCharts[elem].destroy(); } catch(e) { console.warn("destroy chart failed", e); } }
        htCharts[elem] = new Chart(cvs, data);

        // ポップアップ冒頭テキスト追記
        elCtTx.innerHTML = elCtTx.innerHTML + htData[elem].name + ':' + layer.feature.ObsData[elem][0] + '[' + htData[elem].unit + '] ';
      }
    }

    // ポップアップ高さ制御
    const diff_margin = 50;
    let diff_bp = elBg.clientHeight - elGp.clientHeight;
    let diff_pc = elGp.clientHeight - elCt.clientHeight;
    if(elBg.clientHeight - diff_margin < elGp.clientHeight){
      elGp.style.height = (elBg.clientHeight - diff_margin) + "px";
      elCt.style.height = (elBg.clientHeight - diff_margin - diff_pc) + "px";
      let diff = elCt.clientHeight - (elBg.clientHeight - diff_margin - diff_pc);
      elCt.style.height = (elBg.clientHeight - diff_margin - diff_pc - diff) + "px";
    }

    // ポップアップ表示
    elBg.classList.add('js_active');
    elGp.classList.add('js_active');
    elBg.onclick = function() {
      elBg.classList.remove('js_active');
      elGp.classList.remove('js_active');
    }

  } catch(err) {
    console.error("DrawGraph_2 error:", err);
  } finally {
    // 進捗表示除去（ただし、現在地が最新なら）
    if(sCurrentCode == layer.feature.properties.Code){
      try { RemoveLoading(); } catch(e) { console.warn("RemoveLoading failed:", e); }
    }
  }
}

//Chart.jsに載せるためのデータを作る
function CreateDataForChartJS(labels, values){
	let Data = {
		type: values.type,
		data: {
			labels: labels,
			datasets: [
				{label:values.name, data:values.values[0], borderColor:"#00F", spanGaps:true, fill:false, borderWidth:1.5, radius:1, lineTension:0},
				{label:values.name, data:values.values[1], borderColor:"#66F", spanGaps:true, fill:false, borderWidth:1.0, radius:1, lineTension:0},
				{label:values.name, data:values.values[2], borderColor:"#AAF", spanGaps:true, fill:false, borderWidth:0.8, radius:1, lineTension:0},
			]
		},
	};
	return(Data);
}

//loading画面 →https://se-log.blogspot.com/2019/11/javascript-screenlook.html
function IndicateLoading(){
	let elSpan = document.createElement("span");
	elSpan.id = "loading_circle";
	
	let elDiv = document.createElement("div");
	elDiv.id = "loading";
	
	let elBody = document.getElementsByTagName("body").item(0);
	
	//exDiv・elSpan(くるくる)のスタイルはCSSに記述
	elDiv.appendChild(elSpan);
	elBody.appendChild(elDiv);
}
function RemoveLoading(elLoading){
	const elDiv = document.getElementById("loading");
	if (!elDiv) {return;}
	if (elDiv.parentNode) { elDiv.parentNode.removeChild(elDiv); }
}

//▼日付処理関係
//Dateオブジェクトから指定書式の文字列を返す
//https://zukucode.com/2017/04/javascript-date-format.html
function formatDate (date, format) {
	format = format.replace(/yyyy/g, date.getFullYear());
	format = format.replace(/MM/g, ('0' + (date.getMonth() + 1)).slice(-2));
	format = format.replace(/dd/g, ('0' + date.getDate()).slice(-2));
	format = format.replace(/HH/g, ('0' + date.getHours()).slice(-2));
	format = format.replace(/mm/g, ('0' + date.getMinutes()).slice(-2));
	format = format.replace(/ss/g, ('0' + date.getSeconds()).slice(-2));
	format = format.replace(/SSS/g, ('00' + date.getMilliseconds()).slice(-3));
	return format;
};
//yyyyMMddHHmmSS→ yyyy/MM/dd HH:mm
function DateTime2Fmtd(DateTime){
	return 	DateTime.substring(0,4)+'/'+DateTime.substring(4,6)+'/'+DateTime.substring(6,8)+' '+
		DateTime.substring(8,10)+':'+DateTime.substring(10,12);
}

//yyyyMMddHHmmSS→Date
function Fmtd2DateTime(FormattedString){
	let iYr = Number(FormattedString.substring(0,4));
	let iMt = Number(FormattedString.substring(4,6))-1;
	let iDy = Number(FormattedString.substring(6,8));
	let iHr = Number(FormattedString.substring(8,10));
	let iMn = Number(FormattedString.substring(10,12));
	return new Date(iYr, iMt, iDy, iHr, iMn);
}