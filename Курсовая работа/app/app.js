(function () {
  var root = document.getElementById("app-root");
  var views = {
    feed: document.getElementById("view-feed"),
    chats: document.getElementById("view-chats"),
    menu: document.getElementById("view-menu"),
    friends: document.getElementById("view-friends"),
    settings: document.getElementById("view-settings"),
    profile: document.getElementById("view-profile"),
    thread: document.getElementById("view-thread"),
  };

  var state = {
    user: null,
    profileUserId: null,
    profileUserName: null,
    threadPeerId: null,
    threadPeerName: null,
    threadPeerAvatarUrl: null,
    threadPeerFrameUrl: null,
    chatId: null,
    chats: [],
    searchTimer: null,
    loading: { feed: false, chats: false, friends: false, profile: false, thread: false },
  };
  var stack = ["feed"];

  var postForm = document.getElementById("post-form");
  var postInput = document.getElementById("post-input");
  var postImageInput = document.getElementById("post-image-input");
  var postAttachmentHint = document.getElementById("post-attachment-hint");
  var postEmojiBtn = document.getElementById("post-emoji-btn");
  var imageLightbox = document.getElementById("image-lightbox");
  var imageLightboxImg = document.getElementById("image-lightbox-img");
  var imageLightboxClose = document.getElementById("image-lightbox-close");
  var chatSearch = document.getElementById("chat-search");
  var chatSearchChats = document.getElementById("chat-search-chats");
  var chatSearchUsers = document.getElementById("chat-search-users");
  var chatList = document.getElementById("chat-list");
  var chatBlockSearch = document.getElementById("chat-block-search");
  var chatImageBtn = document.getElementById("chat-image-btn");
  var chatImageInput = document.getElementById("chat-image-input");
  var chatVideoBtn = document.getElementById("chat-video-btn");
  var chatVideoInput = document.getElementById("chat-video-input");
  var chatSendBtn = document.getElementById("chat-send-btn");
  var chatEmojiBtn = document.getElementById("chat-emoji-btn");
  var chatVoiceBtn = document.getElementById("chat-voice-btn");
  var chatPicker = document.getElementById("chat-picker");
  var chatPickerEmoji = document.getElementById("chat-picker-emoji");
  var chatPickerStickers = document.getElementById("chat-picker-stickers");
  var voiceRecorder = document.getElementById("voice-recorder");
  var voiceRecorderCanvas = document.getElementById("voice-recorder-canvas");
  var voiceStopBtn = document.getElementById("voice-stop-btn");
  var voiceSendBtn = document.getElementById("voice-send-btn");
  var voiceCancelBtn = document.getElementById("voice-cancel-btn");
  var msgInput = document.getElementById("msg-input");
  var profileWriteBtn = document.getElementById("profile-write-btn");
  var profileBanBtn = document.getElementById("profile-ban-btn");
  var profileDeleteBtn = document.getElementById("profile-delete-btn");
  var profileEditBtn = document.getElementById("profile-edit-btn");
  var profileAvatarMount = document.getElementById("profile-avatar-mount");
  var profileBannerImg = document.getElementById("profile-banner-img");
  var profileHero = document.getElementById("profile-hero");
  var threadPeerBtn = document.getElementById("thread-peer-btn");
  var threadPeerAvatarEl = document.getElementById("thread-peer-avatar");
  var editorForm = document.getElementById("profile-editor-form");
  var editorAvatarInput = document.getElementById("editor-avatar-input");
  var editorBannerInput = document.getElementById("editor-banner-input");
  var editorAvatarFrameInput = document.getElementById("editor-avatar-frame");
  var framePicker = document.getElementById("frame-picker");
  var mediaRecorder = null;
  var audioChunks = [];
  var recordedAudioBlob = null;
  var currentRecorderStream = null;
  var recorderAnimation = null;
  var recorderAnalyser = null;
  var recorderDataArray = null;
  var recorderAudioCtx = null;
  var discardRecording = false;
  var wallForm = document.getElementById("wall-form");
  var wallInput = document.getElementById("wall-input");
  var wallMediaInput = document.getElementById("wall-media-input");
  var wallFileInput = document.getElementById("wall-file-input");
  var postMediaDraft = document.getElementById("post-media-draft");
  var postMediaGrid = document.getElementById("post-media-grid");
  var wallMediaDraft = document.getElementById("wall-media-draft");
  var wallMediaGrid = document.getElementById("wall-media-grid");
  var postMediaStaged = [];
  var wallMediaStaged = [];
  var wallFilesStaged = [];
  var wallAttachmentHint = document.getElementById("wall-attachment-hint");
  var repostModal = document.getElementById("repost-modal");
  var repostModalClose = document.getElementById("repost-modal-close");
  var repostStepChoice = document.getElementById("repost-step-choice");
  var repostStepFriends = document.getElementById("repost-step-friends");
  var repostFriendsList = document.getElementById("repost-friends-list");
  var repostToFriendBtn = document.getElementById("repost-to-friend");
  var repostToWallBtn = document.getElementById("repost-to-wall");
  var toastRoot = document.getElementById("toast-root");
  var repostState = { postId: null };

  var EMOJI_PACK = [
    "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","🤯","😭","😡","👍","👎","🙏","👏","🔥","💯","❤️","💔","🎉","🤝","😴","🤖"
  ];

  function allViewEls() {
    return Object.keys(views).map(function (k) {
      return views[k];
    });
  }

  function api(path, options) {
    options = options || {};
    var fetchOptions = Object.assign({}, options);
    fetchOptions.credentials = "include";
    return fetch(path, fetchOptions).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      if (ct.indexOf("application/json") === -1) {
        if (!res.ok) {
          var plainErr = new Error("Request failed");
          plainErr.status = res.status;
          throw plainErr;
        }
        return null;
      }
      return res.json().then(function (data) {
        if (!res.ok || !data || data.ok === false) {
          var err = new Error(data && data.error ? data.error : "Request failed");
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  function redirectToAuth() {
    window.location.href = "/auth/index.html";
  }

  function formatDateTime(ts) {
    if (!ts) return "";
    try {
      var d = new Date(String(ts).replace(" ", "T"));
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return String(ts);
    }
  }

  function makeEmpty(minHeight) {
    var el = document.createElement("div");
    el.className = "empty-block";
    el.setAttribute("aria-hidden", "true");
    if (minHeight) el.style.minHeight = minHeight;
    return el;
  }

  function setImage(imgEl, url) {
    if (!imgEl) return;
    if (url) {
      imgEl.onerror = function () {
        imgEl.hidden = true;
        imgEl.removeAttribute("src");
      };
      imgEl.src = url;
      imgEl.hidden = false;
    } else {
      imgEl.hidden = true;
      imgEl.onerror = null;
      imgEl.removeAttribute("src");
    }
  }

  function profileInitial(name) {
    return ((name || "?").trim().slice(0, 1) || "?").toUpperCase();
  }

  function formatDisplayName(user) {
    if (!user) return "";
    if (user.display_name) return user.display_name;
    var parts = [user.name, user.last_name, user.patronymic].filter(function (p) {
      return p && String(p).trim();
    });
    return parts.join(" ") || user.name || "";
  }

  function applyAvatarFrame(frameImgEl, containerEl, frameUrl) {
    if (!frameImgEl || !containerEl) return;
    if (!frameUrl) {
      setImage(frameImgEl, null);
      containerEl.classList.remove("has-custom-frame");
      return;
    }
    frameImgEl.onload = function () {
      containerEl.classList.add("has-custom-frame");
    };
    frameImgEl.onerror = function () {
      setImage(frameImgEl, null);
      containerEl.classList.remove("has-custom-frame");
    };
    setImage(frameImgEl, frameUrl);
  }

  function initOverlayScrollbars() {
    var scrollEls = document.querySelectorAll(".scroll-area, .thread-messages, .feed-body");
    scrollEls.forEach(function (el) {
      var timer = null;
      el.addEventListener(
        "scroll",
        function () {
          el.classList.add("is-scrolling");
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () {
            el.classList.remove("is-scrolling");
          }, 900);
        },
        { passive: true }
      );
    });
  }

  function setProfileAvatar(user) {
    if (!user || !profileAvatarMount) return;
    var displayName = formatDisplayName(user) || user.name || "";
    profileAvatarMount.innerHTML = "";
    profileAvatarMount.appendChild(
      createAvatar(user.avatar_url, displayName, "profile-avatar", user.avatar_frame_url)
    );
  }

  function setProfileBentoField(tileId, valueElId, value) {
    var tile = document.getElementById(tileId);
    var el = document.getElementById(valueElId);
    if (!el) return;
    var text = (value || "").trim();
    el.textContent = text;
    if (tile) tile.hidden = !text;
  }

  function revokeStagedMedia(staged) {
    staged.forEach(function (item) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }

  function clearMediaStaged(staged, gridEl, draftEl, inputEl, hintEl, mainInput, defaultPlaceholder) {
    revokeStagedMedia(staged);
    staged.length = 0;
    if (gridEl) gridEl.innerHTML = "";
    if (draftEl) draftEl.hidden = true;
    if (inputEl) inputEl.value = "";
    if (hintEl) {
      hintEl.hidden = true;
      hintEl.textContent = "";
    }
    if (mainInput && defaultPlaceholder) mainInput.placeholder = defaultPlaceholder;
  }

  function renderMediaStagedGrid(staged, gridEl, draftEl, onRemove) {
    if (!gridEl) return;
    gridEl.innerHTML = "";
    staged.forEach(function (item, index) {
      var cell = document.createElement("div");
      cell.className = "media-draft__item bento-tile bento-tile--media";
      if (item.file.type.indexOf("video/") === 0) {
        var video = document.createElement("video");
        video.src = item.previewUrl;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        cell.appendChild(video);
      } else {
        var img = document.createElement("img");
        img.src = item.previewUrl;
        img.alt = "";
        cell.appendChild(img);
      }
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "media-draft__remove";
      removeBtn.setAttribute("aria-label", "Убрать файл");
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", function () {
        onRemove(index);
      });
      cell.appendChild(removeBtn);
      gridEl.appendChild(cell);
    });
    if (draftEl) draftEl.hidden = staged.length === 0;
  }

  function stageMediaFiles(fileList, staged, gridEl, draftEl, hintEl, mainInput, captionPlaceholder, onUpdate) {
    if (!fileList || !fileList.length) return;
    Array.prototype.forEach.call(fileList, function (file) {
      if (!file || (!file.type.match(/^image\//) && !file.type.match(/^video\//))) return;
      staged.push({ file: file, previewUrl: URL.createObjectURL(file) });
    });
    renderMediaStagedGrid(staged, gridEl, draftEl, function (index) {
      if (staged[index] && staged[index].previewUrl) URL.revokeObjectURL(staged[index].previewUrl);
      staged.splice(index, 1);
      onUpdate();
    });
    if (hintEl) {
      hintEl.textContent = staged.length + " файл(ов)";
      hintEl.hidden = staged.length === 0;
    }
    if (mainInput && staged.length && captionPlaceholder) mainInput.placeholder = captionPlaceholder;
    onUpdate();
  }

  function appendMediaToFormData(fd, staged) {
    staged.forEach(function (item) {
      if (item.file.type.indexOf("video/") === 0) fd.append("videos", item.file);
      else if (item.file.type.indexOf("image/") === 0) fd.append("images", item.file);
    });
  }

  function setProfileBanner(user) {
    if (!user || !profileHero) return;
    if (!user.banner_url) {
      setImage(profileBannerImg, null);
      profileHero.classList.add("profile-hero--no-banner");
      return;
    }
    profileHero.classList.remove("profile-hero--no-banner");
    if (profileBannerImg) {
      profileBannerImg.onerror = function () {
        setImage(profileBannerImg, null);
        profileHero.classList.add("profile-hero--no-banner");
      };
      setImage(profileBannerImg, user.banner_url);
    }
  }

  function renderThreadHeader() {
    if (threadPeerBtn) {
      threadPeerBtn.textContent = state.threadPeerName || "Чат";
      threadPeerBtn.disabled = !state.threadPeerId;
    }
    if (!threadPeerAvatarEl) return;
    threadPeerAvatarEl.innerHTML = "";
    if (!state.threadPeerId) return;
    threadPeerAvatarEl.appendChild(
      createAvatar(
        state.threadPeerAvatarUrl,
        state.threadPeerName,
        "entity-avatar entity-avatar--thread",
        state.threadPeerFrameUrl
      )
    );
  }

  function insertAtCursor(input, text) {
    if (!input) return;
    var start = input.selectionStart || 0;
    var end = input.selectionEnd || 0;
    var before = input.value.slice(0, start);
    var after = input.value.slice(end);
    input.value = before + text + after;
    var nextPos = start + text.length;
    input.setSelectionRange(nextPos, nextPos);
    input.focus();
  }

  function safeParseWaveform(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function showToast(message) {
    if (!toastRoot) return;
    var el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<span class="toast__check" aria-hidden="true">✓</span><span>' + message + "</span>";
    toastRoot.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3200);
  }

  function closeRepostModal() {
    if (!repostModal) return;
    repostModal.hidden = true;
    repostState.postId = null;
    if (repostStepChoice) repostStepChoice.hidden = false;
    if (repostStepFriends) repostStepFriends.hidden = true;
    if (repostFriendsList) repostFriendsList.innerHTML = "";
  }

  function openRepostModal(postId) {
    if (!repostModal || !postId) return;
    repostState.postId = postId;
    repostModal.hidden = false;
    if (repostStepChoice) repostStepChoice.hidden = false;
    if (repostStepFriends) repostStepFriends.hidden = true;
  }

  async function loadRepostFriends() {
    if (!repostFriendsList) return;
    repostFriendsList.innerHTML = "";
    try {
      var data = await api("/api/contacts?limit=50");
      var users = data && data.users ? data.users : [];
      if (!users.length) {
        repostFriendsList.textContent = "Нет собеседников. Напишите кому-нибудь в чате.";
        return;
      }
      users.forEach(function (user) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "repost-friend-btn";
        var userLabel = formatDisplayName(user) || user.name;
        btn.appendChild(createAvatar(user.avatar_url, userLabel, "entity-avatar", user.avatar_frame_url));
        var name = document.createElement("span");
        name.textContent = userLabel;
        btn.appendChild(name);
        btn.addEventListener("click", function () {
          api("/api/posts/" + repostState.postId + "/repost", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: "chat", peer_id: user.id }),
          })
            .then(function () {
              closeRepostModal();
              showToast("Сообщение отправлено");
            })
            .catch(function (err) {
              if (err && err.status === 401) redirectToAuth();
              else alert(err.message || String(err));
            });
        });
        repostFriendsList.appendChild(btn);
      });
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    }
  }

  function openImageLightbox(src) {
    if (!src || !imageLightbox || !imageLightboxImg) return;
    imageLightboxImg.src = src;
    imageLightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeImageLightbox() {
    if (!imageLightbox || !imageLightboxImg) return;
    imageLightbox.hidden = true;
    imageLightboxImg.src = "";
    document.body.style.overflow = "";
  }

  function bindImageLightbox(img) {
    if (!img || !img.src) return;
    img.addEventListener("click", function (e) {
      e.stopPropagation();
      openImageLightbox(img.src);
    });
  }

  function postMediaItems(post) {
    if (!post) return [];
    if (post.media && post.media.length) return post.media;
    var legacy = [];
    if (post.image_url) legacy.push({ type: "image", url: post.image_url });
    if (post.video_url) legacy.push({ type: "video", url: post.video_url });
    return legacy;
  }

  function appendPostMedia(container, post) {
    if (!container || !post) return;
    var media = postMediaItems(post);
    if (!media.length) {
      return;
    }
    var grid = document.createElement("div");
    grid.className = "post-media-grid bento-media-grid";
    media.forEach(function (item) {
      if (!item || !item.url) return;
      var cell = document.createElement("div");
      cell.className = "post-media-grid__cell bento-tile bento-tile--media";
      if (item.type === "video") {
        var video = document.createElement("video");
        video.className = "post-media__video";
        video.src = item.url;
        video.controls = true;
        video.preload = "metadata";
        cell.appendChild(video);
      } else {
        var img = document.createElement("img");
        img.className = "post-media__img";
        img.src = item.url;
        img.alt = "";
        bindImageLightbox(img);
        cell.appendChild(img);
      }
      grid.appendChild(cell);
    });
    container.appendChild(grid);
    media.forEach(function (item) {
      if (item.type !== "file" || !item.url) return;
      var link = document.createElement("a");
      link.className = "post-file-link";
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "📎 " + (item.name || post.file_name || "Скачать файл");
      container.appendChild(link);
    });
    if (post.file_url && !media.some(function (m) { return m.type === "file"; })) {
      var legacyLink = document.createElement("a");
      legacyLink.className = "post-file-link";
      legacyLink.href = post.file_url;
      legacyLink.target = "_blank";
      legacyLink.rel = "noopener";
      legacyLink.textContent = "📎 " + (post.file_name || "Скачать файл");
      container.appendChild(legacyLink);
    }
  }

  function renderRepostThread(card, post, context) {
    var orig = post.original_post;
    if (!orig) return;

    var thread = document.createElement("div");
    thread.className = "post-repost-thread";

    var originHead = document.createElement("div");
    originHead.className = "post-repost-origin";
    originHead.appendChild(createAvatar(orig.author.avatar_url, orig.author.name, "entity-avatar", orig.author.avatar_frame_url));
    var originMeta = document.createElement("div");
    var originLabel = document.createElement("div");
    originLabel.className = "post-repost-origin__label";
    originLabel.textContent = "Автор поста";
    var originName = document.createElement("div");
    originName.className = "post-author-name";
    originName.textContent = orig.author.name;
    originMeta.appendChild(originLabel);
    originMeta.appendChild(originName);
    originHead.appendChild(originMeta);
    thread.appendChild(originHead);

    if (orig.content) {
      var origText = document.createElement("div");
      origText.className = "post-content";
      origText.textContent = orig.content;
      thread.appendChild(origText);
    }
    appendPostMedia(thread, orig);
    card.appendChild(thread);

    if (context === "wall" && post.wall_owner) {
      var wallLine = document.createElement("div");
      wallLine.className = "post-repost-wall";
      wallLine.appendChild(createAvatar(post.wall_owner.avatar_url, post.wall_owner.name, "entity-avatar", post.wall_owner.avatar_frame_url));
      var wallText = document.createElement("span");
      wallText.textContent = "На стене у " + post.wall_owner.name;
      wallLine.appendChild(wallText);
      card.appendChild(wallLine);
    }
  }

  function renderPostFooter(card, post, context) {
    var footer = document.createElement("div");
    footer.className = "post-footer";

    var likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "post-action-btn" + (post.liked_by_me ? " is-liked" : "");
    likeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="' +
      (post.liked_by_me ? "currentColor" : "none") +
      '" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg><span>' +
      (post.likes_count || 0) +
      "</span>";
    likeBtn.addEventListener("click", function () {
      api("/api/posts/" + post.id + "/like", { method: "POST" })
        .then(function (data) {
          post.liked_by_me = data.liked;
          post.likes_count = data.likes_count;
          likeBtn.classList.toggle("is-liked", data.liked);
          likeBtn.querySelector("span").textContent = String(data.likes_count);
          likeBtn.querySelector("svg").setAttribute("fill", data.liked ? "currentColor" : "none");
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
        });
    });

    var repostBtn = document.createElement("button");
    repostBtn.type = "button";
    repostBtn.className = "post-action-btn";
    repostBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg><span>Репост</span>';
    repostBtn.addEventListener("click", function () {
      openRepostModal(post.id);
    });

    var commentBtn = document.createElement("button");
    commentBtn.type = "button";
    commentBtn.className = "post-action-btn";
    commentBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8z"/></svg><span>' +
      (post.comments_count || 0) +
      "</span>";

    var commentsWrap = document.createElement("div");
    commentsWrap.className = "post-comments";
    commentsWrap.hidden = true;

    function loadComments() {
      api("/api/posts/" + post.id + "/comments")
        .then(function (data) {
          commentsWrap.innerHTML = "";
          var comments = data && data.comments ? data.comments : [];
          comments.forEach(function (c) {
            var row = document.createElement("div");
            row.className = "post-comment";
            row.appendChild(createAvatar(c.author.avatar_url, c.author.name, "entity-avatar entity-avatar--message", c.author.avatar_frame_url));
            var body = document.createElement("div");
            body.className = "post-comment__body";
            var cname = document.createElement("div");
            cname.className = "post-comment__name";
            cname.textContent = c.author.name;
            var ctext = document.createElement("div");
            ctext.className = "post-comment__text";
            ctext.textContent = c.content;
            body.appendChild(cname);
            body.appendChild(ctext);
            row.appendChild(body);
            commentsWrap.appendChild(row);
          });
          var form = document.createElement("form");
          form.className = "post-comment-form";
          var input = document.createElement("textarea");
          input.className = "composer__input";
          input.rows = 1;
          input.placeholder = "Комментарий…";
          var submit = document.createElement("button");
          submit.type = "submit";
          submit.className = "btn btn--primary";
          submit.textContent = "Отпр.";
          form.appendChild(input);
          form.appendChild(submit);
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            var text = (input.value || "").trim();
            if (!text) return;
            api("/api/posts/" + post.id + "/comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: text }),
            })
              .then(function () {
                input.value = "";
                post.comments_count = (post.comments_count || 0) + 1;
                commentBtn.querySelector("span").textContent = String(post.comments_count);
                return loadComments();
              })
              .catch(function (err) {
                if (err && err.status === 401) redirectToAuth();
                else alert(err.message || String(err));
              });
          });
          commentsWrap.appendChild(form);
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
        });
    }

    commentBtn.addEventListener("click", function () {
      var open = commentsWrap.hidden;
      commentsWrap.hidden = !open;
      if (open) loadComments();
    });

    footer.appendChild(likeBtn);
    footer.appendChild(repostBtn);
    footer.appendChild(commentBtn);
    card.appendChild(footer);
    card.appendChild(commentsWrap);
  }

  function createAvatar(url, name, className, frameUrl) {
    var el = document.createElement("div");
    el.className = className || "entity-avatar";
    if (url) {
      var img = document.createElement("img");
      img.className = "entity-avatar__img";
      img.src = url;
      img.alt = name || "";
      img.onerror = function () {
        img.remove();
        el.classList.add("entity-avatar--fallback");
        el.textContent = ((name || "?").trim().slice(0, 1) || "?").toUpperCase();
      };
      el.appendChild(img);
    } else {
      el.classList.add("entity-avatar--fallback");
      el.textContent = ((name || "?").trim().slice(0, 1) || "?").toUpperCase();
    }
    if (frameUrl) {
      var frame = document.createElement("img");
      frame.className = "avatar-frame";
      frame.alt = "";
      frame.onload = function () {
        el.classList.add("has-custom-frame");
      };
      frame.onerror = function () {
        frame.remove();
        el.classList.remove("has-custom-frame");
      };
      frame.src = frameUrl;
      el.appendChild(frame);
    }
    return el;
  }

  function openProfile(userId, userName) {
    state.profileUserId = userId;
    state.profileUserName = userName || null;
    pushView("profile");
  }

  function openThread(chatId, peer) {
    state.chatId = chatId;
    state.threadPeerId = peer && peer.id ? peer.id : null;
    state.threadPeerName = peer ? formatDisplayName(peer) || peer.name : null;
    state.threadPeerAvatarUrl = peer && peer.avatar_url ? peer.avatar_url : null;
    state.threadPeerFrameUrl = peer && peer.avatar_frame_url ? peer.avatar_frame_url : null;
    renderThreadHeader();
    pushView("thread");
  }

  async function openThreadWithPeer(peerId, peerName) {
    var peer = { id: peerId, name: peerName, avatar_url: null, avatar_frame_url: null };
    try {
      var userData = await api("/api/users/" + peerId);
      if (userData && userData.user) {
        peer.avatar_url = userData.user.avatar_url;
        peer.avatar_frame_url = userData.user.avatar_frame_url;
        peer.name = userData.user.name || peerName;
        peer.last_name = userData.user.last_name;
        peer.patronymic = userData.user.patronymic;
        peer.display_name = userData.user.display_name;
      }
    } catch (e) {
      /* keep minimal peer info */
    }
    var data = await api("/api/chats/find-or-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer_id: peerId }),
    });
    openThread(data.chat_id, peer);
  }

  function renderChatPreview(lastMessage) {
    if (!lastMessage) return "Пока сообщений нет";
    if (lastMessage.message_type === "image") {
      return lastMessage.content ? "Фото: " + lastMessage.content : "Фотография";
    }
    if (lastMessage.message_type === "sticker") return "Стикер";
    if (lastMessage.message_type === "voice") return "Голосовое сообщение";
    return lastMessage.content || "Пока сообщений нет";
  }

  function clearChatSearchSections() {
    if (chatSearchChats) {
      chatSearchChats.innerHTML = "";
    }
    if (chatSearchUsers) {
      chatSearchUsers.innerHTML = "";
    }
  }

  function showFullChatList() {
    clearChatSearchSections();
    if (chatBlockSearch) chatBlockSearch.hidden = true;
    if (chatList) {
      chatList.hidden = false;
      chatList.className = "section-gap";
    }
  }

  function renderChatItems(chats, container) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "section-gap";
    if (!chats || !chats.length) {
      container.appendChild(makeEmpty("160px"));
      return;
    }
    chats.forEach(function (chat) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "glass-panel chat-item chat-item--rich";
      item.addEventListener("click", function () {
        openThread(chat.chat_id, chat.peer);
      });

      item.appendChild(
        createAvatar(
          chat.peer && chat.peer.avatar_url,
          chat.peer && chat.peer.name,
          "entity-avatar entity-avatar--chat",
          chat.peer && chat.peer.avatar_frame_url
        )
      );

      var body = document.createElement("div");
      body.className = "chat-item__body";

      var top = document.createElement("div");
      top.className = "chat-item__top";

      var title = document.createElement("div");
      title.className = "chat-item__title";
      title.textContent = chat.peer ? formatDisplayName(chat.peer) || chat.peer.name : "Чат";

      var time = document.createElement("div");
      time.className = "chat-item__time";
      time.textContent = chat.last_message ? formatDateTime(chat.last_message.created_at) : "";

      var sub = document.createElement("div");
      sub.className = "chat-item__sub";
      sub.textContent = renderChatPreview(chat.last_message);

      top.appendChild(title);
      top.appendChild(time);
      body.appendChild(top);
      body.appendChild(sub);
      item.appendChild(body);
      container.appendChild(item);
    });
  }

  function renderUserItems(users, container) {
    if (!container) return;
    container.innerHTML = "";
    container.className = "section-gap";
    if (!users || !users.length) {
      container.appendChild(makeEmpty("120px"));
      return;
    }
    users.forEach(function (user) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "glass-panel chat-item chat-item--rich";
      item.addEventListener("click", function () {
        openThreadWithPeer(user.id, user.name).catch(function (err) {
          alert(err.message || String(err));
        });
      });

      item.appendChild(createAvatar(user.avatar_url, user.name, "entity-avatar entity-avatar--chat", user.avatar_frame_url));

      var body = document.createElement("div");
      body.className = "chat-item__body";

      var top = document.createElement("div");
      top.className = "chat-item__top";
      var name = document.createElement("div");
      name.className = "chat-item__title";
      name.textContent = user.name;
      top.appendChild(name);

      var sub = document.createElement("div");
      sub.className = "chat-item__sub";
      sub.textContent = "Нажмите, чтобы написать";

      body.appendChild(top);
      body.appendChild(sub);
      item.appendChild(body);
      container.appendChild(item);
    });
  }

  function renderPostCard(post, compact) {
    var context = compact ? "wall" : "feed";
    var card = document.createElement("div");
    card.className = "bento-tile post-card" + (compact ? " post-card--compact" : "");
    var isRepost = Boolean(post.original_post);

    if (!isRepost) {
      var head = document.createElement("div");
      head.className = "post-head";
      var actions = document.createElement("div");
      actions.className = "post-actions";

      if (!compact) {
        var authorBtn = document.createElement("button");
        authorBtn.type = "button";
        authorBtn.className = "post-author-btn";
        authorBtn.addEventListener("click", function () {
          if (post.author) openProfile(post.author.id, post.author.name);
        });
        authorBtn.appendChild(
          createAvatar(
            post.author && post.author.avatar_url,
            post.author && post.author.name,
            "entity-avatar",
            post.author && post.author.avatar_frame_url
          )
        );
        var metaWrap = document.createElement("div");
        metaWrap.className = "post-author-meta";
        var authorName = document.createElement("div");
        authorName.className = "post-author-name";
        authorName.textContent = post.author ? post.author.name : "Пользователь";
        var meta = document.createElement("div");
        meta.className = "post-meta";
        meta.textContent = formatDateTime(post.created_at);
        metaWrap.appendChild(authorName);
        metaWrap.appendChild(meta);
        authorBtn.appendChild(metaWrap);
        head.appendChild(authorBtn);
      } else {
        var compactMeta = document.createElement("div");
        compactMeta.className = "post-meta";
        compactMeta.textContent = formatDateTime(post.created_at);
        head.appendChild(compactMeta);
      }

      var ownerId = post.author && post.author.id;
      var canDelete =
        state.user && post && post.id && (ownerId === state.user.id || state.user.god_mode);
      if (canDelete) {
        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn--ghost btn--icon post-del-btn";
        delBtn.setAttribute("aria-label", "Удалить пост");
        delBtn.title = "Удалить";
        delBtn.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
        delBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (!confirm("Удалить пост?")) return;
          api("/api/posts/" + post.id, { method: "DELETE" })
            .then(function () {
              return Promise.all([
                loadFeed(),
                state.profileUserId ? loadProfile() : Promise.resolve(),
              ]);
            })
            .catch(function (err) {
              if (err && err.status === 401) redirectToAuth();
              else alert(err.message || String(err));
            });
        });
        actions.appendChild(delBtn);
      }
      if (actions.childNodes.length) head.appendChild(actions);
      card.appendChild(head);

      if (post.content) {
        var content = document.createElement("div");
        content.className = "post-content";
        content.textContent = post.content;
        card.appendChild(content);
      }
      appendPostMedia(card, post);
    } else {
      var repostHead = document.createElement("div");
      repostHead.className = "post-head";
      var repostMeta = document.createElement("div");
      repostMeta.className = "post-meta";
      repostMeta.textContent = formatDateTime(post.created_at) + " · репост";
      repostHead.appendChild(repostMeta);

      var repostActions = document.createElement("div");
      repostActions.className = "post-actions";
      var repostOwnerId = post.wall_owner && post.wall_owner.id;
      if (state.user && post.id && (repostOwnerId === state.user.id || state.user.god_mode)) {
        var delRepost = document.createElement("button");
        delRepost.type = "button";
        delRepost.className = "btn btn--ghost btn--icon post-del-btn";
        delRepost.innerHTML =
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
        delRepost.addEventListener("click", function () {
          if (!confirm("Удалить репост?")) return;
          api("/api/posts/" + post.id, { method: "DELETE" })
            .then(function () {
              return state.profileUserId ? loadProfile() : loadFeed();
            })
            .catch(function (err) {
              if (err && err.status === 401) redirectToAuth();
              else alert(err.message || String(err));
            });
        });
        repostActions.appendChild(delRepost);
      }
      if (repostActions.childNodes.length) repostHead.appendChild(repostActions);
      card.appendChild(repostHead);
      renderRepostThread(card, post, context);
    }

    renderPostFooter(card, post, context);
    return card;
  }

  function renderChatRepostPost(bubble, repostPost) {
    if (!repostPost) return;
    var displayPost = repostPost.original_post || repostPost;
    var author = displayPost.author || repostPost.author;
    if (!author) return;

    bubble.classList.add("message-bubble--repost");

    var card = document.createElement("div");
    card.className = "chat-repost-full";

    var head = document.createElement("div");
    head.className = "chat-repost-full__head";
    head.appendChild(
      createAvatar(author.avatar_url, author.name, "entity-avatar entity-avatar--message", author.avatar_frame_url)
    );
    var meta = document.createElement("div");
    meta.className = "chat-repost-full__meta";
    var name = document.createElement("div");
    name.className = "chat-repost-full__name";
    name.textContent = author.name;
    var label = document.createElement("div");
    label.className = "chat-repost-full__label";
    label.textContent = "Репост записи";
    meta.appendChild(name);
    meta.appendChild(label);
    head.appendChild(meta);
    card.appendChild(head);

    var body = document.createElement("div");
    body.className = "chat-repost-full__body";
    if (displayPost.content) {
      var content = document.createElement("div");
      content.className = "post-content";
      content.textContent = displayPost.content;
      body.appendChild(content);
    }
    appendPostMedia(body, displayPost);
    card.appendChild(body);
    bubble.appendChild(card);
  }

  function activateView(name) {
    var target = views[name];
    if (!target) return;

    allViewEls().forEach(function (el) {
      var on = el === target;
      el.classList.toggle("is-active", on);
      el.hidden = !on;
    });

    var mainTabs = ["feed", "chats", "menu"];
    var isSub = mainTabs.indexOf(name) === -1;
    root.classList.toggle("app--sub", isSub);

    document.querySelectorAll(".nav-tab-btn").forEach(function (btn) {
      var tab = btn.getAttribute("data-tab");
      var active = !isSub && tab === name;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });

    if (!state.user) return;
    if (name === "feed" && !state.loading.feed) loadFeed();
    else if (name === "chats" && !state.loading.chats) loadChats();
    else if (name === "friends" && !state.loading.friends) loadFriends();
    else if (name === "profile" && !state.loading.profile) loadProfile();
    else if (name === "thread" && !state.loading.thread) loadThreadMessages();
    else if (name === "settings") loadEditor();
  }

  function showView(name) {
    stack = [name];
    activateView(name);
  }

  function pushView(name) {
    stack.push(name);
    activateView(name);
  }

  function popView() {
    if (stack.length <= 1) {
      showView("feed");
      return;
    }
    stack.pop();
    activateView(stack[stack.length - 1]);
  }

  async function loadFeed() {
    state.loading.feed = true;
    try {
      var feed = document.getElementById("feed-posts");
      if (!feed) return;
      feed.innerHTML = "";
      var data = await api("/api/feed?limit=30");
      var posts = data && data.posts ? data.posts : [];
      if (!posts.length) {
        feed.appendChild(makeEmpty("220px"));
        return;
      }
      posts.forEach(function (post) {
        feed.appendChild(renderPostCard(post, false));
      });
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    } finally {
      state.loading.feed = false;
    }
  }

  async function loadChats() {
    state.loading.chats = true;
    try {
      var data = await api("/api/chats");
      var chats = data && data.chats ? data.chats : [];
      state.chats = chats;
      showFullChatList();
      renderChatItems(chats, chatList);
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    } finally {
      state.loading.chats = false;
    }
  }

  async function runUserSearch(query) {
    if (!chatSearchChats || !chatSearchUsers) return;
    clearChatSearchSections();
    if (!query) {
      showFullChatList();
      return;
    }

    if (chatList) chatList.hidden = true;
    if (chatBlockSearch) chatBlockSearch.hidden = false;
    var q = String(query || "").trim().toLowerCase();

    var matchedChats = (state.chats || []).filter(function (c) {
      var name = (c && c.peer && c.peer.name ? c.peer.name : "").toLowerCase();
      return name.indexOf(q) !== -1;
    });
    var chatsTitle = document.createElement("div");
    chatsTitle.className = "search-section-title";
    chatsTitle.textContent = "В чатах";
    chatSearchChats.appendChild(chatsTitle);
    var chatsWrap = document.createElement("div");
    chatSearchChats.appendChild(chatsWrap);
    renderChatItems(matchedChats, chatsWrap);

    try {
      var data = await api("/api/users?q=" + encodeURIComponent(query) + "&limit=20");
      var users = data && data.users ? data.users : [];
      var inChats = new Set(
        (state.chats || [])
          .map(function (c) {
            return c && c.peer ? c.peer.id : null;
          })
          .filter(Boolean)
      );
      var newUsers = users.filter(function (u) {
        return !inChats.has(u.id);
      });

      var usersTitle = document.createElement("div");
      usersTitle.className = "search-section-title";
      usersTitle.textContent = "Все пользователи";
      chatSearchUsers.appendChild(usersTitle);
      var usersWrap = document.createElement("div");
      chatSearchUsers.appendChild(usersWrap);
      renderUserItems(newUsers, usersWrap);
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    }
  }

  async function loadFriends() {
    state.loading.friends = true;
    try {
      var friends = document.getElementById("friends-list");
      if (!friends) return;
      friends.innerHTML = "";
      var data = await api("/api/contacts?limit=50");
      var users = data && data.users ? data.users : [];
      if (!users.length) {
        friends.appendChild(makeEmpty("220px"));
        return;
      }
      users.forEach(function (user) {
        var userLabel = formatDisplayName(user) || user.name;
        var item = document.createElement("button");
        item.type = "button";
        item.className = "glass-panel friend-item friend-item--rich";
        item.addEventListener("click", function () {
          openProfile(user.id, userLabel);
        });
        item.appendChild(createAvatar(user.avatar_url, userLabel, "entity-avatar", user.avatar_frame_url));
        var name = document.createElement("div");
        name.className = "friend-item__name";
        name.textContent = userLabel;
        item.appendChild(name);
        friends.appendChild(item);
      });
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    } finally {
      state.loading.friends = false;
    }
  }

  function drawWaveformOnCanvas(canvas, peaks, progress) {
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    var data = peaks && peaks.length ? peaks : new Array(36).fill(0.2);
    var barW = Math.max(2, Math.floor(w / data.length) - 1);
    for (var i = 0; i < data.length; i++) {
      var amp = Math.max(0.06, Math.min(1, data[i]));
      var bh = Math.max(3, Math.floor((h - 8) * amp));
      var x = i * (barW + 1);
      var y = Math.floor((h - bh) / 2);
      var ratio = i / data.length;
      ctx.fillStyle = ratio <= progress ? "rgba(124,155,255,0.95)" : "rgba(255,255,255,0.35)";
      ctx.fillRect(x, y, barW, bh);
    }
  }

  async function computeWaveformFromBlob(blob) {
    try {
      var arr = await blob.arrayBuffer();
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var audio = await ctx.decodeAudioData(arr.slice(0));
      var ch = audio.getChannelData(0);
      var bars = 48;
      var block = Math.floor(ch.length / bars);
      var out = [];
      for (var i = 0; i < bars; i++) {
        var sum = 0;
        var start = i * block;
        var end = Math.min(ch.length, start + block);
        for (var j = start; j < end; j++) sum += Math.abs(ch[j]);
        var amp = end > start ? sum / (end - start) : 0;
        out.push(Math.max(0.06, Math.min(1, amp * 4)));
      }
      ctx.close();
      return out;
    } catch (e) {
      return [];
    }
  }

  function refreshPostMediaDraft() {
    renderMediaStagedGrid(postMediaStaged, postMediaGrid, postMediaDraft, function (index) {
      if (postMediaStaged[index] && postMediaStaged[index].previewUrl) {
        URL.revokeObjectURL(postMediaStaged[index].previewUrl);
      }
      postMediaStaged.splice(index, 1);
      refreshPostMediaDraft();
    });
    if (postAttachmentHint) {
      postAttachmentHint.textContent = postMediaStaged.length ? postMediaStaged.length + " файл(ов)" : "";
      postAttachmentHint.hidden = !postMediaStaged.length;
    }
    if (postInput) {
      postInput.placeholder = postMediaStaged.length
        ? "Подпись к публикации…"
        : "Что нового?";
    }
  }

  function refreshWallMediaDraft() {
    renderMediaStagedGrid(wallMediaStaged, wallMediaGrid, wallMediaDraft, function (index) {
      if (wallMediaStaged[index] && wallMediaStaged[index].previewUrl) {
        URL.revokeObjectURL(wallMediaStaged[index].previewUrl);
      }
      wallMediaStaged.splice(index, 1);
      refreshWallMediaDraft();
    });
    updateWallAttachmentHint();
    if (wallInput) {
      wallInput.placeholder = wallMediaStaged.length || wallFilesStaged.length
        ? "Подпись к публикации…"
        : "Запись на стене…";
    }
  }

  function renderVoiceMessage(bubble, m) {
    var wrap = document.createElement("div");
    wrap.className = "voice-message";
    var row = document.createElement("div");
    row.className = "voice-message__row";

    var play = document.createElement("button");
    play.type = "button";
    play.className = "voice-message__play";
    play.textContent = "▶";

    var canvas = document.createElement("canvas");
    canvas.className = "voice-message__canvas";
    canvas.width = 200;
    canvas.height = 38;

    var audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = m.audio_url || "";

    var peaks = safeParseWaveform(m.waveform);
    drawWaveformOnCanvas(canvas, peaks, 0);

    play.addEventListener("click", function () {
      if (audio.paused) audio.play();
      else audio.pause();
    });
    audio.addEventListener("play", function () {
      play.textContent = "⏸";
    });
    audio.addEventListener("pause", function () {
      play.textContent = "▶";
    });
    audio.addEventListener("ended", function () {
      play.textContent = "▶";
      drawWaveformOnCanvas(canvas, peaks, 0);
    });
    audio.addEventListener("timeupdate", function () {
      var p = audio.duration ? audio.currentTime / audio.duration : 0;
      drawWaveformOnCanvas(canvas, peaks, p);
    });

    row.appendChild(play);
    row.appendChild(canvas);
    wrap.appendChild(row);
    bubble.appendChild(wrap);
  }

  async function loadProfile() {
    state.loading.profile = true;
    try {
      if (!state.profileUserId) return;
      var userTitle = document.querySelector("#view-profile .profile-name");
      var wall = document.getElementById("profile-wall");
      if (!userTitle || !wall) return;

      wall.innerHTML = "";
      var data = await api("/api/users/" + state.profileUserId);
      var user = data.user;
      state.profileUserName = formatDisplayName(user) || user.name || null;

      userTitle.textContent = formatDisplayName(user) || user.name || "";
      setProfileAvatar(user);
      setProfileBanner(user);
      var fullName = formatDisplayName(user);
      if (user.last_name || user.patronymic) {
        setProfileBentoField("profile-tile-fio", "profile-full-name", fullName);
      } else {
        setProfileBentoField("profile-tile-fio", "profile-full-name", "");
      }
      setProfileBentoField("profile-tile-about", "profile-about", user.about_text);
      setProfileBentoField("profile-tile-relation", "profile-relation-status", user.relation_status);
      setProfileBentoField("profile-tile-education", "profile-education", user.education_place);
      setProfileBentoField("profile-tile-city", "profile-city", user.city);

      var mine = state.user && state.profileUserId === state.user.id;
      if (profileWriteBtn) {
        profileWriteBtn.disabled = mine;
        profileWriteBtn.style.opacity = mine ? "0.55" : "1";
      }
      if (profileEditBtn) profileEditBtn.hidden = !mine;
      if (profileBanBtn) profileBanBtn.hidden = !(!mine && state.user && state.user.god_mode);
      if (profileDeleteBtn) profileDeleteBtn.hidden = !(!mine && state.user && state.user.god_mode);
      if (wallForm) {
        wallForm.hidden = !mine;
        wallForm.style.display = mine ? "" : "none";
      }
      if (!mine) {
        if (wallInput) wallInput.value = "";
        clearMediaStaged(wallMediaStaged, wallMediaGrid, wallMediaDraft, wallMediaInput, wallAttachmentHint, wallInput, "Запись на стене…");
        wallFilesStaged = [];
        if (wallFileInput) wallFileInput.value = "";
      }

      var postsData = await api("/api/users/" + state.profileUserId + "/posts?limit=50");
      var posts = postsData && postsData.posts ? postsData.posts : [];
      if (!posts.length) {
        wall.appendChild(makeEmpty("160px"));
        return;
      }
      posts.forEach(function (post) {
        wall.appendChild(renderPostCard(post, true));
      });
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    } finally {
      state.loading.profile = false;
    }
  }

  async function loadThreadMessages() {
    state.loading.thread = true;
    try {
      var list = document.getElementById("thread-messages-list");
      if (!list) return;
      list.innerHTML = "";
      if (!state.chatId) {
        list.appendChild(makeEmpty("120px"));
        return;
      }

      if (state.threadPeerId && !state.threadPeerAvatarUrl) {
        try {
          var peerData = await api("/api/users/" + state.threadPeerId);
          if (peerData && peerData.user) {
            state.threadPeerName = formatDisplayName(peerData.user) || peerData.user.name || state.threadPeerName;
            state.threadPeerAvatarUrl = peerData.user.avatar_url;
            state.threadPeerFrameUrl = peerData.user.avatar_frame_url;
          }
        } catch (e) {
          /* ignore */
        }
      }
      renderThreadHeader();

      var data = await api("/api/chats/" + state.chatId + "/messages?limit=200");
      var messages = data && data.messages ? data.messages : [];
      if (!messages.length) {
        list.appendChild(makeEmpty("120px"));
        return;
      }

      messages.forEach(function (m) {
        var mine = state.user && m.sender_id === state.user.id;
        var row = document.createElement("div");
        row.className = "message-row" + (mine ? " message-row--mine" : "");

        var head = document.createElement("div");
        head.className = "message-row__head";
        if (!mine) {
          head.appendChild(
            createAvatar(
              m.sender_avatar_url,
              m.sender_name,
              "entity-avatar entity-avatar--message",
              m.sender_avatar_frame_url
            )
          );
        }

        var wrap = document.createElement("div");
        wrap.className = "message-bubble-wrap";

        if (!mine && m.sender_name) {
          var senderLabel = document.createElement("div");
          senderLabel.className = "message-sender-name";
          senderLabel.textContent = m.sender_name;
          wrap.appendChild(senderLabel);
        }

        var bubble = document.createElement("div");
        bubble.className = "message-bubble" + (mine ? " message-bubble--mine" : " message-bubble--peer");
        if (m.message_type === "image" && m.image_url) {
          bubble.classList.add("message-bubble--media");
          var img = document.createElement("img");
          img.src = m.image_url;
          img.alt = "Изображение";
          img.className = "message-image";
          bindImageLightbox(img);
          bubble.appendChild(img);
          if (m.content) {
            var caption = document.createElement("div");
            caption.className = "message-caption";
            caption.textContent = m.content;
            bubble.appendChild(caption);
          }
        } else if (m.message_type === "sticker" && m.sticker_url) {
          bubble.classList.add("message-bubble--media");
          var st = document.createElement("img");
          st.src = m.sticker_url;
          st.alt = "Стикер";
          st.className = "message-image";
          st.style.width = "128px";
          st.style.height = "128px";
          st.style.maxWidth = "128px";
          st.style.objectFit = "contain";
          bubble.appendChild(st);
        } else if (m.message_type === "voice" && m.audio_url) {
          bubble.classList.add("message-bubble--voice");
          renderVoiceMessage(bubble, m);
        } else if (m.message_type === "video" && m.video_url) {
          bubble.classList.add("message-bubble--media");
          var video = document.createElement("video");
          video.className = "message-video";
          video.src = m.video_url;
          video.controls = true;
          video.preload = "metadata";
          bubble.appendChild(video);
          if (m.content) {
            var videoCaption = document.createElement("div");
            videoCaption.className = "message-caption";
            videoCaption.textContent = m.content;
            bubble.appendChild(videoCaption);
          }
        } else if (m.message_type === "repost" && m.repost_post) {
          renderChatRepostPost(bubble, m.repost_post);
        } else {
          bubble.textContent = m.content || "";
        }

        var time = document.createElement("div");
        time.className = "message-time";
        time.textContent = formatDateTime(m.created_at);

        wrap.appendChild(bubble);
        wrap.appendChild(time);

        if (state.user && state.user.god_mode && m.id) {
          var adminDel = document.createElement("button");
          adminDel.type = "button";
          adminDel.className = "message-admin-del";
          adminDel.title = "Удалить (админ)";
          adminDel.textContent = "×";
          adminDel.addEventListener("click", function () {
            if (!confirm("Удалить сообщение?")) return;
            api("/api/admin/messages/" + m.id, { method: "DELETE" })
              .then(function () {
                return loadThreadMessages();
              })
              .catch(function (err) {
                if (err && err.status === 401) redirectToAuth();
                else alert(err.message || String(err));
              });
          });
          wrap.appendChild(adminDel);
        }

        head.appendChild(wrap);
        row.appendChild(head);
        list.appendChild(row);
      });

      setTimeout(function () {
        var outer = document.querySelector("#view-thread .thread-messages");
        if (outer) outer.scrollTop = outer.scrollHeight;
      }, 0);
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
    } finally {
      state.loading.thread = false;
    }
  }

  async function sendMessage(options) {
    options = options || {};
    if (!state.user || !state.chatId) return;
    var text = (msgInput.value || "").trim();
    var imageFile = options.imageFile || null;
    var videoFile = options.videoFile || null;
    var stickerUrl = options.stickerUrl || null;
    var audioBlob = options.audioBlob || null;
    var waveform = options.waveform || [];
    if (!text && !imageFile && !videoFile && !stickerUrl && !audioBlob) return;

    msgInput.disabled = true;
    if (chatImageBtn) chatImageBtn.disabled = true;
    if (chatVideoBtn) chatVideoBtn.disabled = true;
    try {
      if (audioBlob) {
        var fdAudio = new FormData();
        fdAudio.append("audio", audioBlob, "voice.webm");
        fdAudio.append("waveform", JSON.stringify(waveform || []));
        await api("/api/chats/" + state.chatId + "/messages", { method: "POST", body: fdAudio });
      } else if (videoFile) {
        var fdVideo = new FormData();
        fdVideo.append("video", videoFile);
        fdVideo.append("content", text);
        await api("/api/chats/" + state.chatId + "/messages", { method: "POST", body: fdVideo });
      } else if (imageFile) {
        var fd = new FormData();
        fd.append("image", imageFile);
        fd.append("content", text);
        await api("/api/chats/" + state.chatId + "/messages", { method: "POST", body: fd });
      } else if (stickerUrl) {
        await api("/api/chats/" + state.chatId + "/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sticker_url: stickerUrl, message_type: "sticker" }),
        });
      } else {
        await api("/api/chats/" + state.chatId + "/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        });
      }
      msgInput.value = "";
      if (chatImageInput) chatImageInput.value = "";
      if (chatVideoInput) chatVideoInput.value = "";
      await loadChats();
      await loadThreadMessages();
    } catch (err) {
      if (err && err.status === 401) redirectToAuth();
      else alert(err.message || String(err));
    } finally {
      msgInput.disabled = false;
      if (chatImageBtn) chatImageBtn.disabled = false;
      if (chatVideoBtn) chatVideoBtn.disabled = false;
    }
  }

  async function uploadAvatar(file) {
    var fd = new FormData();
    fd.append("avatar", file);
    var data = await api("/api/me/avatar", { method: "POST", body: fd });
    state.user = data.user;
    if (state.profileUserId === state.user.id) {
      setProfileAvatar(state.user);
    }
    await Promise.all([loadFeed(), loadChats(), loadFriends(), loadProfile()]);
  }

  async function uploadBanner(file) {
    var fd = new FormData();
    fd.append("banner", file);
    var data = await api("/api/me/banner", { method: "POST", body: fd });
    state.user = data.user;
    if (state.profileUserId === state.user.id) setProfileBanner(state.user);
    await loadProfile();
  }

  async function loadEditor() {
    if (!editorForm || !state.user) return;
    var data = await api("/api/me");
    state.user = data.user;
    document.getElementById("editor-name").value = state.user.name || "";
    var editorLastName = document.getElementById("editor-last-name");
    var editorPatronymic = document.getElementById("editor-patronymic");
    if (editorLastName) editorLastName.value = state.user.last_name || "";
    if (editorPatronymic) editorPatronymic.value = state.user.patronymic || "";
    document.getElementById("editor-birth-date").value = state.user.birth_date || "";
    document.getElementById("editor-city").value = state.user.city || "";
    document.getElementById("editor-education").value = state.user.education_place || "";
    document.getElementById("editor-relation-status").value = state.user.relation_status || "";
    document.getElementById("editor-about").value = state.user.about_text || "";
    if (editorAvatarFrameInput) editorAvatarFrameInput.value = state.user.avatar_frame_url || "";
    await loadFramesIntoPicker();
  }

  function pickFrame(url) {
    if (editorAvatarFrameInput) editorAvatarFrameInput.value = url || "";
    if (!framePicker) return;
    framePicker.querySelectorAll(".frame-option").forEach(function (el) {
      el.classList.toggle("is-selected", el.getAttribute("data-url") === (url || ""));
    });
  }

  async function loadFramesIntoPicker() {
    if (!framePicker) return;
    framePicker.innerHTML = "";
    try {
      var data = await api("/api/frames");
      var frames = data && data.frames ? data.frames : [];

      var noneBtn = document.createElement("button");
      noneBtn.type = "button";
      noneBtn.className = "frame-option";
      noneBtn.setAttribute("data-url", "");
      noneBtn.innerHTML = '<div class="frame-option__label">Без рамки</div>';
      noneBtn.addEventListener("click", function () {
        pickFrame("");
      });
      framePicker.appendChild(noneBtn);

      frames.forEach(function (f) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "frame-option";
        btn.setAttribute("data-url", f.url);

        var img = document.createElement("img");
        img.className = "frame-option__preview";
        img.src = f.url;
        img.alt = f.name || "Рамка";
        btn.appendChild(img);

        var label = document.createElement("div");
        label.className = "frame-option__label";
        label.textContent = f.name || "";
        btn.appendChild(label);

        btn.addEventListener("click", function () {
          pickFrame(f.url);
        });
        framePicker.appendChild(btn);
      });

      pickFrame(state.user && state.user.avatar_frame_url ? state.user.avatar_frame_url : "");
    } catch (err) {
      // если нет рамок/ошибка — просто оставим пусто
    }
  }

  async function loadChatPickerContent() {
    if (chatPickerEmoji) {
      chatPickerEmoji.innerHTML = "";
      EMOJI_PACK.forEach(function (emoji) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "emoji-btn";
        btn.textContent = emoji;
        btn.addEventListener("click", function () {
          insertAtCursor(msgInput, emoji);
        });
        chatPickerEmoji.appendChild(btn);
      });
    }
    if (chatPickerStickers) {
      chatPickerStickers.innerHTML = "";
      try {
        var data = await api("/api/stickers");
        var stickers = data && data.stickers ? data.stickers : [];
        stickers.forEach(function (st) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "sticker-btn";
          var img = document.createElement("img");
          img.src = st.url;
          img.alt = st.name || "sticker";
          btn.appendChild(img);
          btn.addEventListener("click", function () {
            sendMessage({ stickerUrl: st.url });
          });
          chatPickerStickers.appendChild(btn);
        });
      } catch (err) {}
    }
  }

  function switchPickerTab(tab) {
    document.querySelectorAll("[data-picker-tab]").forEach(function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-picker-tab") === tab);
    });
    if (chatPickerEmoji) chatPickerEmoji.hidden = tab !== "emoji";
    if (chatPickerStickers) chatPickerStickers.hidden = tab !== "stickers";
  }

  function stopRecorderVisual() {
    if (recorderAnimation) cancelAnimationFrame(recorderAnimation);
    recorderAnimation = null;
    if (recorderAudioCtx) {
      try { recorderAudioCtx.close(); } catch (e) {}
    }
    recorderAudioCtx = null;
    recorderAnalyser = null;
    recorderDataArray = null;
  }

  function stopRecorderTracks() {
    if (currentRecorderStream) {
      currentRecorderStream.getTracks().forEach(function (t) { t.stop(); });
      currentRecorderStream = null;
    }
  }

  function renderRecorderLoop() {
    if (!voiceRecorderCanvas || !recorderAnalyser || !recorderDataArray) return;
    recorderAnalyser.getByteTimeDomainData(recorderDataArray);
    var peaks = [];
    var chunk = Math.max(1, Math.floor(recorderDataArray.length / 48));
    for (var i = 0; i < 48; i++) {
      var sum = 0;
      var start = i * chunk;
      var end = Math.min(recorderDataArray.length, start + chunk);
      for (var j = start; j < end; j++) sum += Math.abs(recorderDataArray[j] - 128) / 128;
      peaks.push(Math.min(1, sum / Math.max(1, end - start) * 2.5));
    }
    drawWaveformOnCanvas(voiceRecorderCanvas, peaks, 1);
    recorderAnimation = requestAnimationFrame(renderRecorderLoop);
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Запись голоса не поддерживается в этом браузере.");
      return;
    }
    recordedAudioBlob = null;
    audioChunks = [];
    if (voiceSendBtn) voiceSendBtn.disabled = true;
    var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    currentRecorderStream = stream;
    recorderAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var src = recorderAudioCtx.createMediaStreamSource(stream);
    recorderAnalyser = recorderAudioCtx.createAnalyser();
    recorderAnalyser.fftSize = 1024;
    recorderDataArray = new Uint8Array(recorderAnalyser.frequencyBinCount);
    src.connect(recorderAnalyser);
    renderRecorderLoop();

    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = function (evt) {
      if (evt.data && evt.data.size > 0) audioChunks.push(evt.data);
    };
    mediaRecorder.onstop = function () {
      stopRecorderTracks();
      stopRecorderVisual();
      if (discardRecording) {
        discardRecording = false;
        recordedAudioBlob = null;
        if (voiceSendBtn) voiceSendBtn.disabled = true;
        return;
      }
      recordedAudioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      if (voiceSendBtn) voiceSendBtn.disabled = !recordedAudioBlob;
    };
    mediaRecorder.start();
    if (voiceRecorder) voiceRecorder.hidden = false;
    if (chatPicker) chatPicker.hidden = true;
  }

  async function initAuth() {
    try {
      var data = await api("/api/me");
      state.user = data.user;
      state.profileUserId = state.user.id;
      state.profileUserName = state.user.name;
      loadFeed();
    } catch (err) {
      redirectToAuth();
    }
  }

  function updateWallAttachmentHint() {
    if (!wallAttachmentHint) return;
    var count = wallMediaStaged.length + wallFilesStaged.length;
    if (count) {
      wallAttachmentHint.textContent = count + " вложение(й)";
      wallAttachmentHint.hidden = false;
    } else {
      wallAttachmentHint.hidden = true;
      wallAttachmentHint.textContent = "";
    }
  }

  if (wallMediaInput) {
    wallMediaInput.addEventListener("change", function () {
      if (wallMediaInput.files && wallMediaInput.files.length) {
        stageMediaFiles(
          wallMediaInput.files,
          wallMediaStaged,
          wallMediaGrid,
          wallMediaDraft,
          wallAttachmentHint,
          wallInput,
          "Подпись к публикации…",
          refreshWallMediaDraft
        );
      }
      wallMediaInput.value = "";
    });
  }

  if (wallFileInput) {
    wallFileInput.addEventListener("change", function () {
      wallFilesStaged = wallFileInput.files ? Array.prototype.slice.call(wallFileInput.files) : [];
      updateWallAttachmentHint();
      if (wallInput && (wallFilesStaged.length || wallMediaStaged.length)) {
        wallInput.placeholder = "Подпись к публикации…";
      }
    });
  }

  if (wallForm && wallInput) {
    wallForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var content = (wallInput.value || "").trim();
      var hasMedia = wallMediaStaged.length > 0;
      var hasFiles = wallFilesStaged.length > 0;
      if (!content && !hasMedia && !hasFiles) return;
      var fd = new FormData();
      fd.append("content", content);
      fd.append("scope", "wall");
      appendMediaToFormData(fd, wallMediaStaged);
      wallFilesStaged.forEach(function (file) {
        fd.append("files", file);
      });
      wallInput.disabled = true;
      api("/api/posts", { method: "POST", body: fd })
        .then(function () {
          wallInput.value = "";
          clearMediaStaged(wallMediaStaged, wallMediaGrid, wallMediaDraft, wallMediaInput, wallAttachmentHint, wallInput, "Запись на стене…");
          wallFilesStaged = [];
          if (wallFileInput) wallFileInput.value = "";
          return loadProfile();
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        })
        .finally(function () {
          wallInput.disabled = false;
        });
    });
  }

  if (repostModalClose) {
    repostModalClose.addEventListener("click", closeRepostModal);
  }
  if (repostModal) {
    repostModal.addEventListener("click", function (e) {
      if (e.target === repostModal) closeRepostModal();
    });
  }
  if (repostToFriendBtn) {
    repostToFriendBtn.addEventListener("click", function () {
      if (repostStepChoice) repostStepChoice.hidden = true;
      if (repostStepFriends) repostStepFriends.hidden = false;
      loadRepostFriends();
    });
  }
  if (repostToWallBtn) {
    repostToWallBtn.addEventListener("click", function () {
      if (!repostState.postId) return;
      api("/api/posts/" + repostState.postId + "/repost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "wall" }),
      })
        .then(function () {
          closeRepostModal();
          showToast("Опубликовано на стене");
          if (state.profileUserId === (state.user && state.user.id)) return loadProfile();
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        });
    });
  }

  if (postImageInput) {
    postImageInput.addEventListener("change", function () {
      if (postImageInput.files && postImageInput.files.length) {
        stageMediaFiles(
          postImageInput.files,
          postMediaStaged,
          postMediaGrid,
          postMediaDraft,
          postAttachmentHint,
          postInput,
          "Подпись к публикации…",
          refreshPostMediaDraft
        );
      }
      postImageInput.value = "";
    });
  }

  if (imageLightbox) {
    imageLightbox.addEventListener("click", function (e) {
      if (e.target === imageLightbox) closeImageLightbox();
    });
  }
  if (imageLightboxClose) {
    imageLightboxClose.addEventListener("click", closeImageLightbox);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && imageLightbox && !imageLightbox.hidden) closeImageLightbox();
  });

  if (postForm && postInput) {
    postForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var content = (postInput.value || "").trim();
      var hasMedia = postMediaStaged.length > 0;
      if (!content && !hasMedia) return;
      postInput.disabled = true;
      var request;
      if (hasMedia) {
        var fd = new FormData();
        fd.append("content", content);
        fd.append("scope", "feed");
        appendMediaToFormData(fd, postMediaStaged);
        request = api("/api/posts", { method: "POST", body: fd });
      } else {
        request = api("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: content, scope: "feed" }),
        });
      }
      request
        .then(function () {
          postInput.value = "";
          clearMediaStaged(postMediaStaged, postMediaGrid, postMediaDraft, postImageInput, postAttachmentHint, postInput, "Что нового?");
          return loadFeed();
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        })
        .finally(function () {
          postInput.disabled = false;
        });
    });
  }

  if (profileWriteBtn) {
    profileWriteBtn.addEventListener("click", function () {
      if (!state.profileUserId || !state.user || state.profileUserId === state.user.id) return;
      openThreadWithPeer(state.profileUserId, state.profileUserName || null).catch(function (err) {
        alert(err.message || String(err));
      });
    });
  }

  if (profileEditBtn) {
    profileEditBtn.addEventListener("click", function () {
      pushView("settings");
    });
  }

  if (threadPeerBtn) {
    threadPeerBtn.addEventListener("click", function () {
      if (state.threadPeerId) openProfile(state.threadPeerId, state.threadPeerName || null);
    });
  }

  if (msgInput) {
    msgInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", function () {
      sendMessage();
    });
  }

  if (postEmojiBtn) {
    postEmojiBtn.addEventListener("click", function () {
      var pick = EMOJI_PACK[Math.floor(Math.random() * EMOJI_PACK.length)] || "😊";
      insertAtCursor(postInput, pick);
    });
  }

  if (chatEmojiBtn) {
    chatEmojiBtn.addEventListener("click", function () {
      if (!chatPicker) return;
      chatPicker.hidden = !chatPicker.hidden;
      if (!chatPicker.hidden) {
        switchPickerTab("emoji");
        loadChatPickerContent();
      }
    });
  }

  document.querySelectorAll("[data-picker-tab]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      switchPickerTab(btn.getAttribute("data-picker-tab"));
    });
  });

  if (chatVoiceBtn) {
    chatVoiceBtn.addEventListener("click", function () {
      if (voiceRecorder && !voiceRecorder.hidden) {
        if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
        return;
      }
      startVoiceRecording().catch(function (err) {
        alert(err && err.message ? err.message : "Не удалось начать запись.");
      });
    });
  }

  if (voiceStopBtn) {
    voiceStopBtn.addEventListener("click", function () {
      if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
    });
  }

  if (voiceCancelBtn) {
    voiceCancelBtn.addEventListener("click", function () {
      discardRecording = true;
      if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
      recordedAudioBlob = null;
      if (voiceRecorder) voiceRecorder.hidden = true;
      stopRecorderTracks();
      stopRecorderVisual();
      if (voiceSendBtn) voiceSendBtn.disabled = true;
    });
  }

  if (voiceSendBtn) {
    voiceSendBtn.addEventListener("click", function () {
      if (!recordedAudioBlob) return;
      computeWaveformFromBlob(recordedAudioBlob)
        .then(function (peaks) {
          return sendMessage({ audioBlob: recordedAudioBlob, waveform: peaks });
        })
        .then(function () {
          recordedAudioBlob = null;
          if (voiceRecorder) voiceRecorder.hidden = true;
          if (voiceSendBtn) voiceSendBtn.disabled = true;
        })
        .catch(function (err) {
          alert(err && err.message ? err.message : "Ошибка отправки голосового");
        });
    });
  }

  if (chatImageBtn && chatImageInput) {
    chatImageBtn.addEventListener("click", function () {
      chatImageInput.click();
    });
    chatImageInput.addEventListener("change", function () {
      if (chatImageInput.files && chatImageInput.files[0]) {
        sendMessage({ imageFile: chatImageInput.files[0] });
      }
    });
  }

  if (chatVideoBtn && chatVideoInput) {
    chatVideoBtn.addEventListener("click", function () {
      chatVideoInput.click();
    });
    chatVideoInput.addEventListener("change", function () {
      if (chatVideoInput.files && chatVideoInput.files[0]) {
        sendMessage({ videoFile: chatVideoInput.files[0] });
      }
    });
  }

  if (editorAvatarInput) {
    editorAvatarInput.addEventListener("change", function () {
      if (editorAvatarInput.files && editorAvatarInput.files[0]) {
        uploadAvatar(editorAvatarInput.files[0]).catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        });
      }
    });
  }

  if (editorBannerInput) {
    editorBannerInput.addEventListener("change", function () {
      if (editorBannerInput.files && editorBannerInput.files[0]) {
        uploadBanner(editorBannerInput.files[0]).catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        });
      }
    });
  }

  if (editorForm) {
    editorForm.addEventListener("submit", function (e) {
      e.preventDefault();
      api("/api/me/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: document.getElementById("editor-name").value,
          last_name: document.getElementById("editor-last-name") ? document.getElementById("editor-last-name").value : "",
          patronymic: document.getElementById("editor-patronymic") ? document.getElementById("editor-patronymic").value : "",
          birth_date: document.getElementById("editor-birth-date").value,
          city: document.getElementById("editor-city").value,
          education_place: document.getElementById("editor-education").value,
          relation_status: document.getElementById("editor-relation-status").value,
          about_text: document.getElementById("editor-about").value,
          avatar_frame_url: editorAvatarFrameInput ? editorAvatarFrameInput.value : "",
        }),
      })
        .then(function (data) {
          state.user = data.user;
          state.profileUserId = state.user.id;
          state.profileUserName = formatDisplayName(state.user) || state.user.name;
          showToast("Изменения сохранены");
          return Promise.all([loadProfile(), loadFeed(), loadChats(), loadFriends()]);
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        });
    });
  }

  if (chatSearch) {
    chatSearch.addEventListener("input", function () {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () {
        runUserSearch((chatSearch.value || "").trim());
      }, 180);
    });
  }

  if (profileBanBtn) {
    profileBanBtn.addEventListener("click", function () {
      if (!state.profileUserId) return;
      if (!confirm("Забанить этот аккаунт?")) return;
      api("/api/admin/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: state.profileUserId }),
      })
        .then(function () {
          alert("Аккаунт забанен.");
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        });
    });
  }

  if (profileDeleteBtn) {
    profileDeleteBtn.addEventListener("click", function () {
      if (!state.profileUserId) return;
      if (!confirm("Удалить пользователя и все его данные? Это необратимо.")) return;
      api("/api/admin/users/" + state.profileUserId, { method: "DELETE" })
        .then(function () {
          alert("Пользователь удалён.");
          popView();
          return Promise.all([loadFeed(), loadChats(), loadFriends()]);
        })
        .catch(function (err) {
          if (err && err.status === 401) redirectToAuth();
          else alert(err.message || String(err));
        });
    });
  }

  document.querySelectorAll(".nav-tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var tab = btn.getAttribute("data-tab");
      if (tab === "feed") showView("feed");
      else if (tab === "chats") showView("chats");
      else if (tab === "menu") showView("menu");
    });
  });

  document.querySelectorAll("[data-go]").forEach(function (el) {
    el.addEventListener("click", function () {
      var go = el.getAttribute("data-go");
      if (go === "friends") pushView("friends");
      else if (go === "profile-self") {
        state.profileUserId = state.user ? state.user.id : null;
        state.profileUserName = state.user ? state.user.name : null;
        pushView("profile");
      } else if (go === "settings") {
        pushView("settings");
      }
    });
  });

  document.querySelectorAll("[data-back]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      popView();
    });
  });

  initOverlayScrollbars();
  initAuth();
})();

(function () {
  var col = document.getElementById("sidebar-col");
  var handle = document.getElementById("sidebar-resizer");
  if (!col || !handle) return;

  var MIN = 0;
  var MAX = 320;
  var DEFAULT_W = 240;
  var STORAGE_KEY = "lancelot-sidebar-width";

  function readStored() {
    var v = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (isNaN(v)) return DEFAULT_W;
    return Math.max(MIN, Math.min(MAX, v));
  }

  function setW(px) {
    px = Math.max(MIN, Math.min(MAX, Math.round(px)));
    col.style.width = px + "px";
    col.classList.toggle("sidebar-col--collapsed", px === 0);
    try {
      localStorage.setItem(STORAGE_KEY, String(px));
    } catch (e) {}
  }

  setW(readStored());

  var dragging = false;
  var startX = 0;
  var startW = 0;

  function onMove(clientX) {
    var dx = clientX - startX;
    setW(startW + dx);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    col.classList.remove("is-dragging");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  handle.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startW = col.getBoundingClientRect().width;
    col.classList.add("is-dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    onMove(e.clientX);
  });

  document.addEventListener("mouseup", endDrag);
  window.addEventListener("blur", endDrag);

  handle.addEventListener("dblclick", function () {
    setW(DEFAULT_W);
  });

  handle.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 1) return;
      dragging = true;
      startX = e.touches[0].clientX;
      startW = col.getBoundingClientRect().width;
      col.classList.add("is-dragging");
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (!dragging) return;
      onMove(e.touches[0].clientX);
      e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener("touchend", endDrag);
  document.addEventListener("touchcancel", endDrag);
})();
