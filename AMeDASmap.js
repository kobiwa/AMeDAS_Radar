// ▼ Canvas描画層の共通基底クラス（DPR対応・イベント透過・ライフサイクル管理）
L.CanvasFeatureLayer = L.Layer.extend({
    initialize: function (geojson, options) {
        this._geojson = geojson;
        L.setOptions(this, options);
        this._animFrameId = null; // rAF管理用
    },
    onAdd: function (map) {
        this._map = map;
        if (!this._canvas) {
            this._canvas = L.DomUtil.create('canvas', 'leaflet-canvas-feature-layer');
            this._canvas.style.position = 'absolute';
            this._canvas.style.pointerEvents = 'none';
        }
        var pane = map.getPane(this.options.pane || 'overlayPane');
        if (this._canvas.parentNode !== pane) {
            pane.appendChild(this._canvas);
        }
        // move中もrAFで制御するためイベント登録
        map.on('move resize zoomend', this._onMapEvent, this);
        this._onMapEvent();
    },
    onRemove: function (map) {
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }
        if (this._canvas && this._canvas.parentNode) {
            this._canvas.parentNode.removeChild(this._canvas);
        }
        map.off('move resize zoomend', this._onMapEvent, this);
    },
    // ★リスク対策2: rAFを用いて描画リクエストをフレーム単位に集約・間引き
    _onMapEvent: function () {
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
        }
        this._animFrameId = requestAnimationFrame(this._update.bind(this));
    },
    _update: function () {
        if (!this._map || !this._canvas) return;

        var size = this._map.getSize();
        // ★リスク対策3: iPhone等のDPR=3対策（上限2に制限してVRAMオーバーを防ぐ）
        var dpr = Math.min(window.devicePixelRatio || 1, 2);

        var targetWidth = size.x * dpr;
        var targetHeight = size.y * dpr;

        // ★リスク対策1: サイズが実際に変わった時だけ Canvas をリサイズ（VRAM再割り当て防止）
        if (this._canvas.width !== targetWidth || this._canvas.height !== targetHeight) {
            this._canvas.width = targetWidth;
            this._canvas.height = targetHeight;
            this._canvas.style.width = size.x + 'px';
            this._canvas.style.height = size.y + 'px';
        }

        var topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);

        var ctx = this._canvas.getContext('2d');
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, size.x, size.y);

        if (this._geojson && this._geojson.features) {
            var bounds = this._map.getBounds().pad(0.05);
            this._drawFeatures(ctx, bounds);
        }
        ctx.restore();
    }
});

// ▼ テキスト一括描画クラス
L.CanvasTextLayer = L.CanvasFeatureLayer.extend({
    _drawFeatures: function (ctx, bounds, topLeft) {
        var textKey = this.options.textKey;
        var font = this.options.font || '12px sans-serif';
        var defaultColor = this.options.color || '#000000';
        var colorFunc = this.options.colorFunc;
        var defaultStrokeColor = this.options.strokeColor || '#ffffff';
        var strokeColorFunc = this.options.strokeColorFunc;
        var offsetX = this.options.offsetX || 0;
        var offsetY = this.options.offsetY || 0;

        ctx.font = font;
        ctx.textAlign = this.options.textAlign || 'center';
        ctx.textBaseline = 'middle';

        for (var i = 0; i < this._geojson.features.length; i++) {
            var feature = this._geojson.features[i];
            var val = feature.properties[textKey];
            if (val === undefined || val === 'NA' || val === null) continue;

            var lat = feature.geometry.coordinates[1];
            var lng = feature.geometry.coordinates[0];
            if (!bounds.contains([lat, lng])) continue;

            var pt = this._map.latLngToContainerPoint([lat, lng]);
            var x = pt.x + offsetX;
            var y = pt.y + offsetY;

            var textStr = (typeof val === 'number') ? val.toFixed(1) : String(val);
            var textColor = colorFunc ? colorFunc(val) : defaultColor;
            var strokeColor = strokeColorFunc ? strokeColorFunc(val) : defaultStrokeColor;

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 3;
            ctx.strokeText(textStr, x, y);

            ctx.fillStyle = textColor;
            ctx.fillText(textStr, x, y);
        }
    }
});

// ▼ 気温Circle一括描画クラス (今回改修対象)
L.CanvasCircleLayer = L.CanvasFeatureLayer.extend({
    _drawFeatures: function (ctx, bounds, topLeft) {
        var offsetX = this.options.offsetX || 0;
        var offsetY = this.options.offsetY || 0;

        for (var i = 0; i < this._geojson.features.length; i++) {
            var feature = this._geojson.features[i];
            var lat = feature.geometry.coordinates[1];
            var lng = feature.geometry.coordinates[0];

            if (!bounds.contains([lat, lng])) continue;

            var pt = this._map.latLngToContainerPoint([lat, lng]);
            var x = pt.x + offsetX;
            var y = pt.y + offsetY;

            var val = feature.properties.Temp;
            var radius = 4;
            var fillColor = '#404040';

            if (val !== undefined && val !== 'NA' && val !== null && !isNaN(val)) {
                radius = 4;
                fillColor = Temp2Color(Number(val));
            } else {
                radius = 2;
                fillColor = '#404040';
            }

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = '#000000';
            ctx.stroke();
        }
    }
});

// ▼ 気温から袋文字の縁取り色を返す (CSSの配色パターンに準拠)
function Temp2StrokeColor(Temp){
	let i = Math.ceil((Temp-dMinT)/dTStep);
	if(i < 0){ i = 0; }
	else if(sColors.length <= i){ i = sColors.length - 1; }
	
	if(i >= 3 && i <= 9){
		return "#000000";
	} else {
		return "#ffffff";
	}
}

//▼ここから関数集
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
	
	if(bFlgP){
		map.setView([dLat, dLon], iZoom);
	}
	
	if(bFlgT){
		document.legend_temp.elements[0].checked = false;
		document.legend_temp.elements[1].checked = true;
		$('[name="tscale"]').val("original");
		document.legend_temp.elements[2].value=dMinT;
		document.legend_temp.elements[3].value=dTStep;
		document.legend_temp.elements[2].disabled=false;
		document.legend_temp.elements[3].disabled=false;
	}
	
	if(sMap == 'blk' || sMap == 'shd' || sMap == 'pal'){
		$('[name=lyr]').val([sMap]);
		SelectMap(sMap);
	}
}

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
		let w = $("#menu").outerWidth(true);
		$("#menu").css({'width':w+10+"px"});
		
		let w1 = $("#btnExpandMenu").outerWidth(true);
		let w2 = $("#btnCurPos").outerWidth(true);
		let p = (w-w1-w2)/2;
		$("#btnExpandMenu").css({'padding':"1px " + p+"px"});
		
		document.getElementById("sldRadar").style.width = (w-60)+"px";
		if($('[name="tscale"]').val() != "original"){
			document.legend_temp.elements[2].disabled=true;
			document.legend_temp.elements[3].disabled=true;
		}
	}
}

function ExpandMenu(){
	let elSub = document.getElementById("menu_sub");
	if(elSub.style.display=="block"){elSub.style.display="none";}
	else{elSub.style.display="block";}
}

function GetSelectedDateForA(){
	const DateTime = document.getElementById("lsDateTime").value;
	GetObsInfo(DateTime);
}

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

function GetObsData(DateTime){
	const myCanvasRenderer = L.canvas({ pane: "PaneCircle" });
	let url='https://www.jma.go.jp/bosai/amedas/data/map/' + DateTime +'.json';
	$.getJSON(url)
		.done(function(ObsData, status, xhr){
			gjPoints = new GeoJson();
			// ▼ データ更新時のクリーンアップの安全化
			if (lyTempStr) { map.removeLayer(lyTempStr); lyTempStr = null; }
			if (lyTempCrl) { map.removeLayer(lyTempCrl); lyTempCrl = null; }
			if (lyWindBarbL) { map.removeLayer(lyWindBarbL); lyWindBarbL = null; }
			if (lyWindBarbS) { map.removeLayer(lyWindBarbS); lyWindBarbS = null; }
			for (let code in ObsData) {
				let oi = htObsInfo[code];
				if(code in htObsInfo === false) {continue;}
				let dLon = oi.lon[0]+oi.lon[1]/60;
				let dLat = oi.lat[0]+oi.lat[1]/60;
				let dTemp = 'NA';
				
				let es = Array.from(oi.elems, Number);
				
				if('temp' in ObsData[code]){
					if(ObsData[code].temp[1] == 0){ dTemp = ObsData[code].temp[0]; }
				}
				else if (0 < es[0]){
					ObsData[code].temp=new Array(null, null);
				}
				
				let dPrec1h = 'NA';
				if('precipitation1h' in ObsData[code]){
					if(ObsData[code].precipitation1h[1] == 0){ dPrec1h = ObsData[code].precipitation1h[0]; }
				}
				else if (0 < es[1]){
					ObsData[code].precipitation1h=new Array(null, null);
					ObsData[code].precipitation10m=new Array(null, null);
				}
				
				let dWindDir = 'NA';
				let dWindSpd = 'NA';
				if('wind' in ObsData[code]){
					if(ObsData[code].wind[1] == 0){ dWindSpd = ObsData[code].wind[0]; }
					if(ObsData[code].windDirection[1] == 0){ dWindDir = ObsData[code].windDirection[0]; }
				}
				else if (0 < es[3]){
					ObsData[code].wind=new Array(null, null);
				}
				
				if(ObsData[code].humidity == null && 0 < es[6]) {
					ObsData[code].humidity=new Array(null, null);
				}
				if(ObsData[code].pressure == null && 0 < es[7]) {
					ObsData[code].pressure=new Array(null, null);
				}
				
				gjPoints.features.push(new PointFeature(dLon, dLat, code, DateTime, dTemp, dPrec1h, dWindDir, dWindSpd, ObsData));
  			}
  			
  			//▼レイヤ作成
  			//AMeDAS気温(str)
			lyTempStr = new L.CanvasTextLayer(gjPoints, {
				textKey: 'Temp',
				font: 'bold 11.5px sans-serif',
				colorFunc: Temp2Color,
				strokeColorFunc: Temp2StrokeColor,
				offsetY: 10,
				offsetX: -2,
				pane: 'PaneCircle'
			});
			
  			//AMeDAS気温(Cercle)
  			lyTempCrl = new L.CanvasCircleLayer(gjPoints, {
  				offsetX: -1.5, // 位置微調整用
  				offsetY: -1.5, // 位置微調整用
  				pane: 'PaneCircle'
  			});
			
  			//AMeDAS観測点…ポップアップ表示用
  			lyObsPos = L.geoJSON(gjPoints, {
  				pointToLayer: function(feature, latlng){
  					return L.circleMarker(latlng, {
  						radius:20, fillColor:"#000000", fillOpacity:0.0, color:"#000000", opacity:0.0,
  					});
  				}
  			});
  			lyObsPos.on("click", function(e){DrawGraph(e)});
  			
  			//AMeDAS観測点名称
			lyObsName = new L.CanvasTextLayer(gjPoints, {
				textKey: 'Name',
				font: '500 12px sans-serif',
				color: '#000000',
				offsetY: -15,
				offsetX: -2,
				pane: 'PaneCircle'
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
			
			RemoveLoading();
		});
	if(document.getElementById("btnRadar").text != "非表示"){
		GetRadarTimes(DateTime);
	}
}

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

function AddRadarLayer(AMeDAS_Date){
	if(lyRadar != null && map.hasLayer(lyRadar)){map.removeLayer(lyRadar); lyRadar=null;}
	let dtAMeDAS = Fmtd2DateTime(AMeDAS_Date);
	dtAMeDAS.setHours(dtAMeDAS.getHours() - 9);
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

function ChangeRadarOpacity(){
	if(lyRadar && map.hasLayer(lyRadar)){
		let dOpacity = 1 - Number(elSlider.value) /100;
		lyRadar.setOpacity(dOpacity);
	}
}

(function () {
	if (typeof L === 'undefined') {
		throw new Error('Leaflet must be loaded before the ZoomSubstitute plugin.');
	}
	L.TileLayer.ZoomSubstitute = L.TileLayer.extend({
		createTile: function (coords, done) {
			const actualZoom = coords.z;
			const useZoom = (actualZoom % 2 === 1) ? actualZoom - 1 : actualZoom;
			if (coords.z % 2 == 0){
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
				const scale = 2;
				const tileSize = this.options.tileSize;
				
				const X2 = Math.floor(coords.x / scale);
				const Y2 = Math.floor(coords.y / scale);
				const deltX = (coords.x % 2 == 0) ? 0 : -tileSize;
				const deltY = (coords.y % 2 == 0) ? 0 : -tileSize;
				
				const tileP = document.createElement('div');
				tileP.style.width = tileSize + 'px';
				tileP.style.height = tileSize + 'px';
				tileP.style.overflow= 'hidden';
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
			
			if(ctLegT){ map.removeControl(ctLegT); ctLegT = null; }
			SetTempRange();
		} else {
			elMinT.disabled=false;
			elTStep.disabled=false;
		}
		ReplaceURL();
	});
});

function SetTempRange(){
	IndicateLoading();
	setTimeout(function() {
		try{
			if(isNaN(document.legend_temp.elements[2].value)){dMinT = -10;}
			else{dMinT = Number(document.legend_temp.elements[2].value);}
			
			if(isNaN(document.legend_temp.elements[3].value)){dTStep = 5;}
			else{dTStep = Number(document.legend_temp.elements[3].value);}
			
			if(ctLegT){
				map.removeControl(ctLegT);
				ctLegT = null;
			}
			SwitchLegendT();
			let elOpt = document.getElementById("lsDateTime");
			GetObsInfo(elOpt.options[elOpt.selectedIndex].value);
			ReplaceURL();
		} finally {
			RemoveLoading();
		}
	}, 100);
}

function SwitchLegendT(){
	let elLegend = document.getElementById("btnLegend");
	if(!ctLegT){
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
		
		this.ObsInfo=htObsInfo[Code];
		this.ObsData=ObsData[Code];
	}
}

function LayerSwitchByZScale(){
	iZoom = map.getZoom();
	
	if(iZoom < 9){
		if(lyTempStr && map.hasLayer(lyTempStr)){ map.removeLayer(lyTempStr); }
		if(lyWindBarbL && map.hasLayer(lyWindBarbL)){ map.removeLayer(lyWindBarbL); }
		if(lyWindBarbS && !map.hasLayer(lyWindBarbS)){ map.addLayer(lyWindBarbS); }
	} else {
		if(lyWindBarbS && map.hasLayer(lyWindBarbS)){ map.removeLayer(lyWindBarbS); }
		if(lyWindBarbL && !map.hasLayer(lyWindBarbL)){ map.addLayer(lyWindBarbL); }
		if(lyTempStr && !map.hasLayer(lyTempStr)){ map.addLayer(lyTempStr); }
	}
	
	if(iZoom < 10){
		if(lyObsName && map.hasLayer(lyObsName)){ map.removeLayer(lyObsName); }
	} else {
		if(lyObsName && !map.hasLayer(lyObsName)){ map.addLayer(lyObsName); }
	}
}

function AfterMove(){
	iZoom = map.getZoom();
	dLon = map.getCenter().lng.toFixed(6);
	dLat = map.getCenter().lat.toFixed(6);
	ReplaceURL();
	
	LayerSwitchByZScale();
}

function ReplaceURL(){
	let sQuery = "lat=" + dLat + "&"
		+ "lon=" + dLon + "&"
		+ "z=" + iZoom + "&b_map=" + $('[name="lyr"]:checked').val();
	
	if(dMinT != -10 || dTStep != 5){
		sQuery = sQuery + "&t0=" + dMinT + "&" + "dt=" + dTStep;
	}
	window.history.replaceState('', '', '?' + sQuery);
}

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

function MoveToCurPos(){
	if(!navigator.geolocation){
		alert("位置情報を取得できません(ブラウザが非対応)。");
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#888";
		return;
	}
	
	let opts = { enableHighAccuracy:false, timeout:5000, maximumAge:0 };
	
	function success(pos){ 
		map.setView([pos.coords.latitude, pos.coords.longitude]);
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#08F";
		return;
	}
	
	function fail(ex) { 
		alert("位置情報を取得できません(タイムアウト・ブロック等)。"); 
		let elPos = document.getElementById("btnCurPos");
		elPos.style.background="#888";
	}
	
	navigator.geolocation.getCurrentPosition(success, fail, opts);
}

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

function DrawGraph(e){
	setTimeout(DrawGraph_2, 0, e.layer);
	IndicateLoading();
}

async function DrawGraph_2(layer){
	try {
		//対象観測点
		const pps = layer.feature.properties;
		sCurrentCode = pps.Code;
		
		//表示時刻
		const dtNewest = Fmtd2DateTime(document.getElementById("lsDateTime").value);
		
		//ラベル:144=24*6
		const sLabs = new Array(144);
		let dtDat = new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate());
		for(let i = 0; i < sLabs.length; i++){
		  sLabs[i] = formatDate(dtDat, "HH:mm");
		  dtDat.setMinutes(dtDat.getMinutes() + 10);
		}
		
		for(let elem in htData){
			for(let iD = 0; iD < htData[elem].values.length; iD++){
				htData[elem].values[iD] = new Array(sLabs.length).fill(null);
				htData[elem].N = 0;
			}
		}
		
		async function fetchJSON(url){
			try{
				const resp = await fetch(url, {cache: "no-store"});
				if(!resp.ok) return null;
				return await resp.json();
			} catch(e){
				console.warn("fetchJSON error:", url, e);
				return null;
			}
		}
		
		//24時間積算降水量のため4日分を取得
		const requests = [];
		for(let iD = 0; iD < 4; iD++){
			for(let iH = 0; iH < 24; iH += 3){
				  let dt = new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate() - iD);
				  dt.setHours(dt.getHours() + iH);
				  if(dtNewest < dt) break;
				  const url = "https://www.jma.go.jp/bosai/amedas/data/point/" + pps.Code + "/" + formatDate(dt, "yyyyMMdd_HH") + ".json";
				  requests.push({url, iD, baseDate: new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate() - iD)});
			}
		}
		
		const CONCURRENCY = 4;
		async function mapWithConcurrency(items, worker){
			const results = new Array(items.length);
			let idx = 0;
			const runners = new Array(CONCURRENCY).fill(null).map(async () => {
				while(true){
					const i = idx++;
					if(i >= items.length) break;
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
		
		await mapWithConcurrency(requests, async (req) => {
			if(sCurrentCode !== pps.Code) return;
			
			const data = await fetchJSON(req.url);
			if(!data) return;
			
			if(sCurrentCode !== pps.Code) return;
			
			for(const key in data){
				const t = Fmtd2DateTime(key).getTime();
				const base = req.baseDate.getTime();
				const idx = Math.round((t - base) / (10 * 60 * 1000));
				if(idx < 0 || idx >= sLabs.length) continue;
				
				for(const elem in layer.feature.ObsData){
					if(!htData[elem]) continue;
					const cell = data[key][elem];
					if(cell && cell[1] === 0){
						htData[elem].values[req.iD][idx] = cell[0];
						htData[elem].N++;
					}
				}
			}
		});
		
		if(sCurrentCode !== pps.Code) return;
		
		// ▼▼24時間積算降水量の計算▼▼
		if (htData.precipitation10m && htData.precipitation24h) {
		    const prec10mFlat = new Array(4 * 144).fill(null);
		    for (let iD = 0; iD < 4; iD++) {
		        for (let idx = 0; idx < 144; idx++) {
		            const flatIdx = (3 - iD) * 144 + idx;
		            const val = htData.precipitation10m.values[iD][idx];
		            // 欠損値(null/undefined)は計算用に 0 扱い、またはそのまま保持
		            prec10mFlat[flatIdx] = (val !== null && val !== undefined) ? val : null;
		        }
		    }
			
		   htData.precipitation24h.N = 0;
			
		   // スライディングウィンドウ法でO(N)に最適化
			for (let iD = 0; iD < 3; iD++) {
		   	let currentSum = 0;
				let nullCount = 0;
				
		      // 各日の最初の時点 (idx = 0) で過去144コマ分を初期計算
				const startFlatIdx = (3 - iD) * 144;
				for (let k = startFlatIdx - 143; k <= startFlatIdx; k++) {
					if (k < 0 || prec10mFlat[k] === null) {
						nullCount++;
					} else {
						currentSum += prec10mFlat[k];
					}
				}
				
				for (let idx = 0; idx < 144; idx++) {
					const flatIdx = (3 - iD) * 144 + idx;
					
					if (idx > 0) {
						// ウィンドウを1コマ進める：古い要素を引いて新しい要素を足す
						const oldVal = prec10mFlat[flatIdx - 144];
						const newVal = prec10mFlat[flatIdx];
						
						if (flatIdx - 144 < 0 || oldVal === null) nullCount--;
						else currentSum -= oldVal;
						
						if (newVal === null) nullCount++;
						else currentSum += newVal;
					}
					
					// 過去144コマ中、許容範囲内（例: 許容欠損コマ数を10コマ以下に指定、あるいは全揃い条件）
					// 完全に欠損を許さない場合は nullCount === 0
					if (nullCount === 0) {
						const val24h = Math.round(currentSum * 10) / 10;
						htData.precipitation24h.values[iD][idx] = val24h;
						htData.precipitation24h.N++;
					} else {
						htData.precipitation24h.values[iD][idx] = null;
					}
				}
			}
		}
		
		for(let iD = 0; iD < 3; iD++){
			const dtL = new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate() - iD);
			const elLegDay = document.getElementsByClassName('Popup_Legend_Day' + iD);
			for(let i = 0; i < elLegDay.length; i++){
				elLegDay[i].innerHTML = formatDate(dtL, "yyyy/MM/dd");
			}
		}
		
		layer.closePopup();
		
		const elBg = document.getElementById('Popup_Bg');
		const elGp = document.getElementById('PopupGraph');
		const elTt = document.getElementById('PopupGraph_title');
		const elCt = document.getElementById('PopupGraph_content');
		const elCtTx = document.getElementById('PopupGraph_content_text');
		
		elTt.innerText = pps.Name + ' (' + pps.NameKana + ' 標高:' + pps.Altitude + 'm)';
		elCtTx.innerHTML = formatDate(dtNewest, "yyyy/MM/dd HH:mm") + '<br>\n';
		
		const ppWidth = 600;
		if(ppWidth <= elBg.clientWidth) { elGp.style.width = ppWidth + "px"; }
		else { elGp.style.width = elBg.clientWidth + "px"; }
		
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
				
				data.options = {};
				data.options.legend = { display: false };
				data.options.scales = {};
				data.options.scales.yAxes = [];
				data.options.scales.yAxes[0] = { scaleLabel: { labelString: htData[elem].name } };
				data.options.scales.xAxes = [];
				data.options.scales.xAxes[0] = { ticks: { maxTicksLimit: 13 } };
				
				if(elem === 'precipitation10m'){
					const flatVals = [].concat(...htData[elem].values);
					const maxVal = flatVals.length ? Math.max.apply(null, flatVals.filter(v=>v!=null)) : 0;
					if((isFinite(maxVal) ? maxVal : 0) < 1.0){
						data.options.scales.yAxes[0].ticks = { min: 0, max: 1 };
					}
				}
				
				if(htCharts[elem]) { try { htCharts[elem].destroy(); } catch(e) { console.warn("destroy chart failed", e); } }
				htCharts[elem] = new Chart(cvs, data);
				
				//elCtTx.innerHTML = elCtTx.innerHTML + htData[elem].name + ':' + layer.feature.ObsData[elem][0] + '[' + htData[elem].unit + '] ';
				// 変更後（ObsDataに無い計算項目の安全参照を追加）
				if (layer.feature.ObsData[elem] && layer.feature.ObsData[elem][0] !== undefined) {
					elCtTx.innerHTML += htData[elem].name + ':' + layer.feature.ObsData[elem][0] + '[' + htData[elem].unit + '] ';
				} else if (elem === 'precipitation24h') {
					const curIdx = Math.round((dtNewest.getTime() - new Date(dtNewest.getFullYear(), dtNewest.getMonth(), dtNewest.getDate()).getTime()) / (10 * 60 * 1000));
					const val24 = htData.precipitation24h.values[0][curIdx];
					if (val24 !== null && val24 !== undefined) {
						elCtTx.innerHTML += htData[elem].name + ':' + val24 + '[' + htData[elem].unit + '] ';
					}
				}
			}
		}
		
		const diff_margin = 50;
		let diff_bp = elBg.clientHeight - elGp.clientHeight;
		let diff_pc = elGp.clientHeight - elCt.clientHeight;
		if(elBg.clientHeight - diff_margin < elGp.clientHeight){
			elGp.style.height = (elBg.clientHeight - diff_margin) + "px";
			elCt.style.height = (elBg.clientHeight - diff_margin - diff_pc) + "px";
			let diff = elCt.clientHeight - (elBg.clientHeight - diff_margin - diff_pc);
			elCt.style.height = (elBg.clientHeight - diff_margin - diff_pc - diff) + "px";
		}
		
		elBg.classList.add('js_active');
		elGp.classList.add('js_active');
		elBg.onclick = function() {
			elBg.classList.remove('js_active');
			elGp.classList.remove('js_active');
		}
	} catch(err) {
		console.error("DrawGraph_2 error:", err);
	} finally {
		if(sCurrentCode == layer.feature.properties.Code){
			try { RemoveLoading(); } catch(e) { console.warn("RemoveLoading failed:", e); }
		}
	}
}

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

function IndicateLoading(){
	let elSpan = document.createElement("span");
	elSpan.id = "loading_circle";
	
	let elDiv = document.createElement("div");
	elDiv.id = "loading";
	
	let elBody = document.getElementsByTagName("body").item(0);
	
	elDiv.appendChild(elSpan);
	elBody.appendChild(elDiv);
}

function RemoveLoading(elLoading){
	const elDiv = document.getElementById("loading");
	if (!elDiv) {return;}
	if (elDiv.parentNode) { elDiv.parentNode.removeChild(elDiv); }
}

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

function DateTime2Fmtd(DateTime){
	return 	DateTime.substring(0,4)+'/'+DateTime.substring(4,6)+'/'+DateTime.substring(6,8)+' '+
		DateTime.substring(8,10)+':'+DateTime.substring(10,12);
}

function Fmtd2DateTime(FormattedString){
	let iYr = Number(FormattedString.substring(0,4));
	let iMt = Number(FormattedString.substring(4,6))-1;
	let iDy = Number(FormattedString.substring(6,8));
	let iHr = Number(FormattedString.substring(8,10));
	let iMn = Number(FormattedString.substring(10,12));
	return new Date(iYr, iMt, iDy, iHr, iMn);
}