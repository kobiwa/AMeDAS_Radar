//▼ここから関数集
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
		else if(elem[0]=='z'&& !isNaN(elem[1])){dZoom=Number(elem[1]);  bFlgP=1; }
		else if(elem[0]=='t0'&& !isNaN(elem[1])){dMinT=Number(elem[1]); bFlgT=1; }
		else if(elem[0]=='dt'&& !isNaN(elem[1])){dTStep=Number(elem[1]); bFlgT=1; }
		else if(elem[0]=='b_map'){ sMap=elem[1]; }
	}
	
	//位置・縮尺設定
	if(bFlgP){
		map.setView([dLat, dLon], dZoom);
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
			if(lyTempCrl != null && map.hasLayer(lyTempCrl)){ map.removeLayer(lyTempCrl); lyTempStr=null;}
			if(lyWindBarbL != null && map.hasLayer(lyWindBarbL)){ map.removeLayer(lyWindBarbL); lyTempStr=null;}
			if(lyWindBarbS != null && map.hasLayer(lyWindBarbS)){ map.removeLayer(lyWindBarbS); lyTempStr=null;}

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
  			lyObsPos.bindPopup(function(layer){DrawGraph(layer);});


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
			lyRadar = L.tileLayer('https://www.jma.go.jp/bosai/jmatile/data/nowc/'+sB+'/none/'+sV+'/surf/hrpns/{z}/{x}/{y}.png',
				{minZoom:4, maxZoom:16, maxNativeZoom:10, opacity: dOpacity, pane:"PaneRadar"}
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

//ポップアップ
function CreatePopup(feature, layer) {
    if (feature.properties && feature.properties.Caption) {
		layer.bindPopup(feature.properties.Caption);
    }
}

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
			document.legend_temp.elements[2].value=dMinT;
			document.legend_temp.elements[3].value=dTStep;
			ReplaceURL();
		} else {
			elMinT.disabled=false;
			elTStep.disabled=false;
			ReplaceURL();
		}
		SetTempRange();
		map.removeControl(ctLegT);
		ctLegT = null;    		
		SwitchLegendT();
	});
});

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
		this.geometry['coordinates']=[];
		this.geometry['coordinates'][0]=x;
		this.geometry['coordinates'][1]=y;
		
		//主要以外の観測点情報
		this.ObsInfo=htObsInfo[Code];
		this.ObsData=ObsData[Code];
	}
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

//スケールによる表示制御
function LayerSwitchByZScale(){
	dZoom = map.getZoom();
	if(dZoom < 9){
		if(map.hasLayer(lyTempStr)){map.removeLayer(lyTempStr);}
		if(map.hasLayer(lyWindBarbL)){map.removeLayer(lyWindBarbL);}
		if(lyWindBarbS){ map.addLayer(lyWindBarbS);}
	} else {
		if(map.hasLayer(lyWindBarbS)){map.removeLayer(lyWindBarbS);}
		if(lyWindBarbL){map.addLayer(lyWindBarbL);}
		if(lyTempStr) {map.addLayer(lyTempStr);}
	}
}

//URL変更
function ReplaceURL(){
	let sQuery = "lat=" + dLat + "&"
		+ "lon=" + dLon + "&"
		+ "z=" + dZoom + "&b_map=" + $('[name="lyr"]:checked').val();
	
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
function DrawGraph(layer){
	const i3H = 10800000; //3時間のミリ秒(3*3600*1000)
	const iN = 8; //3時間データをどれだけ取得するか
	
	let pps = layer.feature.properties;
	
	//リストボックスで選択された値(日付:yyyyMMddHHmmSS)
	let dtNewest = Fmtd2DateTime(document.getElementById("lsDateTime").value);
	
	//データ初期化
	for(let elem in htData){ htData[elem].values = []; }
	
	//データを取得する
	let sLabs = [];
	$.ajaxSetup({async: false}); //jQueryを同期モードへ
	for(let i = iN - 1; 0 <= i; i--){
		let dt3H = new Date(Math.floor((dtNewest - i * i3H) / i3H) * i3H);
		let sURL = "https://www.jma.go.jp/bosai/amedas/data/point/"+ pps.Code +"/" + formatDate(dt3H, "yyyyMMdd_HH") +".json";
		$.getJSON(sURL, function(data, status, xhr){
			for(let key in data){
				sLabs.push(key.substring(4,6)+'/'+key.substring(6,8)+' '+key.substring(8,10)+':'+key.substring(10,12));
				for(let elem in layer.feature.ObsData){
					if(htData[elem]){
						let value = null;
						if(data[key][elem]){ if(data[key][elem][1] == 0){value = data[key][elem][0]; }} //AQC=0のみ取得
						htData[elem].values.push(value);
					}
				}
			}
		});
	}
	$.ajaxSetup({async: true});
	
	//ポップアップ生成
	let elBg = document.getElementById('Popup_Bg');
	let elGp = document.getElementById('PopupGraph');
	let elTt = document.getElementById('PopupGraph_title');
	let elCt = document.getElementById('PopupGraph_content');
	let elCtTx = document.getElementById('PopupGraph_content_text');
	elTt.innerText=pps.Name+' ('+pps.NameKana+' 標高:'+pps.Altitude+'m)';
	elCtTx.innerHTML=formatDate(dtNewest, "yyyy/MM/dd HH:mm")+'<br>\n';
	
	
	//ポップアップの幅制御
	const ppWidth = 600;
	if(ppWidth <= elBg.clientWidth) { elGp.style.width = ppWidth+"px"; }
	else { elGp.style.width = elBg.clientWidth+"px"; }
	
	//データ生成
	for(let elem in htData){
		let cnt = document.getElementById("cnt_" + elem);
		if(htData[elem].values.length == 0){
			cnt.style.display="none";
		} else {
			cnt.style.display="block";
			let cvs = document.getElementById("cvs_" + elem).getContext("2d");
			let data = CreateDataForChartJS(sLabs, htData[elem]);
			
			//凡例(非表示)・軸ラベル(表示)
			data.options={};
			data.options.legend={display:false,};
			data.options.scales={};
			data.options.scales.yAxes=[];
			data.options.scales.yAxes[0]={scaleLabel:{labelString:htData[elem].name}};
			
			//降水量の処理: 負の値がない(雨が降らないときに不自然になるのを回避)
			if(elem == 'precipitation10m' && Math.max.apply(null, htData[elem].values) < 1.0){
				data.options.scales.yAxes[0].ticks={min:0, max:1};
			}
			
			if(htCharts[elem]) {htCharts[elem].destroy();}
			htCharts[elem] = new Chart(cvs, data);
			
			//ポップアップ冒頭の選択時刻の気象情報
			elCtTx.innerHTML = elCtTx.innerHTML + htData[elem].name +':'+ layer.feature.ObsData[elem][0] + '[' + htData[elem].unit + '] ';
		}
	}
	
	//ポップアップの高さ制御
	const diff_margin=50;
	let diff_bp = elBg.clientHeight - elGp.clientHeight;
	let diff_pc = elGp.clientHeight - elCt.clientHeight;
	if(elBg.clientHeight-diff_margin < elGp.clientHeight){
		elGp.style.height = (elBg.clientHeight-diff_margin)+"px";
		elCt.style.height = (elBg.clientHeight-diff_margin-diff_pc)+"px";
		let diff = elCt.clientHeight - (elBg.clientHeight-diff_margin-diff_pc); //スクロールバーのボタン分がずれるのを回避
		elCt.style.height = (elBg.clientHeight-diff_margin-diff_pc-diff)+"px";
	}
	elBg.classList.add('js_active');
	elGp.classList.add('js_active');
	elBg.onclick = function() { //ポップアップを消すための処理
		elBg.classList.remove('js_active');
		elGp.classList.remove('js_active');
	}
	return ;
}

//Chart.jsに載せるためのデータを作る
function CreateDataForChartJS(labels, values){
	let Data = {
		type: values.type,
		data: {
			labels: labels,
			datasets: [{label:values.label, data:values.values, borderColor:"rgba(0,0,255,1.0)", spanGaps:true, fill:false, borderWidth:1.5, radius:1},]
		},
		options: {line: {tension: 0}}
	};
	return(Data);
}